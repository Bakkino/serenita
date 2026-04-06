import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getBalances,
  extractBestBalance,
  getAllTransactions,
  parseTransaction,
} from "@/lib/enablebanking";
import { autoMatchCategory } from "@/lib/categorize";
import { startOfDay, subDays, format } from "date-fns";

const MAX_SYNC_PER_DAY = 4;

// GET /api/banking/sync — chiamato dal cron Vercel
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  return runSync(null);
}

// POST /api/banking/sync — sync manuale dall'utente
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  return runSync(user.id);
}

// Logica di sync condivisa — userId=null sincronizza tutti gli utenti
async function runSync(userId: string | null) {
  const sessions = await prisma.enableBankingSession.findMany({
    where: {
      isActive: true,
      validUntil: { gt: new Date() },
      ...(userId ? { userId } : {}),
    },
    include: { bankAccount: true },
  });

  const results: Array<{
    accountId: string;
    iban: string | null;
    balanceUpdated: boolean;
    transactionsImported: number;
    error: string | null;
  }> = [];

  for (const session of sessions) {
    // Rate limiting: max 4 sync al giorno per conto
    const today = startOfDay(new Date());
    if (
      session.syncCountDate &&
      startOfDay(session.syncCountDate).getTime() === today.getTime() &&
      session.syncCount >= MAX_SYNC_PER_DAY
    ) {
      results.push({
        accountId: session.accountId,
        iban: session.iban,
        balanceUpdated: false,
        transactionsImported: 0,
        error: `Limite sync giornaliero raggiunto (${MAX_SYNC_PER_DAY})`,
      });
      continue;
    }

    try {
      // ── Aggiorna saldi ────────────────────────
      let balanceUpdated = false;
      const balances = await getBalances(session.accountId);
      const best = extractBestBalance(balances);

      if (best && session.bankAccountId) {
        await prisma.bankAccount.update({
          where: { id: session.bankAccountId },
          data: {
            currentBalance: best.amount,
            currency: best.currency,
          },
        });

        // Salva snapshot giornaliero
        const snapshotDate = startOfDay(new Date());
        await prisma.balanceSnapshot.upsert({
          where: {
            bankAccountId_date: {
              bankAccountId: session.bankAccountId,
              date: snapshotDate,
            },
          },
          update: { balance: best.amount },
          create: {
            bankAccountId: session.bankAccountId,
            date: snapshotDate,
            balance: best.amount,
          },
        });

        balanceUpdated = true;
      }

      // ── Importa transazioni ───────────────────
      const dateFrom = session.lastSyncAt
        ? format(subDays(session.lastSyncAt, 2), "yyyy-MM-dd")
        : format(subDays(new Date(), 30), "yyyy-MM-dd");
      const dateTo = format(new Date(), "yyyy-MM-dd");

      const rawTransactions = await getAllTransactions(
        session.accountId,
        dateFrom,
        dateTo
      );

      let imported = 0;

      for (const raw of rawTransactions) {
        const parsed = parseTransaction(raw);

        if (!session.bankAccountId) continue;

        // Deduplicazione
        const dedupeId = parsed.externalId
          ? `${parsed.externalId}`
          : `${format(parsed.date, "yyyy-MM-dd")}_${parsed.amount}_${parsed.description.slice(0, 50)}`;

        const existing = await prisma.transaction.findFirst({
          where: {
            userId: session.userId,
            bankAccountId: session.bankAccountId,
            externalId: dedupeId,
          },
        });

        if (existing) continue;

        // Auto-categorizzazione
        const categoryId = await autoMatchCategory(
          session.userId,
          parsed.description
        );

        await prisma.transaction.create({
          data: {
            userId: session.userId,
            bankAccountId: session.bankAccountId,
            date: parsed.date,
            amount: parsed.amount,
            currency: parsed.currency,
            description: parsed.description,
            counterpart: parsed.counterpart,
            reference: parsed.reference,
            externalId: dedupeId,
            status: parsed.status,
            categoryId,
          },
        });

        imported++;
      }

      // Aggiorna stato sessione
      const syncCountDate = startOfDay(new Date());
      const resetCount =
        !session.syncCountDate ||
        startOfDay(session.syncCountDate).getTime() !== syncCountDate.getTime();

      await prisma.enableBankingSession.update({
        where: { id: session.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncError: null,
          syncCount: resetCount ? 1 : session.syncCount + 1,
          syncCountDate,
        },
      });

      results.push({
        accountId: session.accountId,
        iban: session.iban,
        balanceUpdated,
        transactionsImported: imported,
        error: null,
      });
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`Sync failed for account ${session.accountId}:`, errorMsg);

      await prisma.enableBankingSession.update({
        where: { id: session.id },
        data: { lastSyncError: errorMsg },
      });

      results.push({
        accountId: session.accountId,
        iban: session.iban,
        balanceUpdated: false,
        transactionsImported: 0,
        error: errorMsg,
      });
    }
  }

  // Aggiorna lastSyncAt del provider
  if (results.some((r) => !r.error)) {
    const providerIds = sessions
      .filter((s) => s.bankAccount?.providerId)
      .map((s) => s.bankAccount!.providerId);

    const uniqueProviderIds = Array.from(new Set(providerIds));
    for (const pid of uniqueProviderIds) {
      await prisma.provider.update({
        where: { id: pid },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
    }
  }

  const totalImported = results.reduce((s, r) => s + r.transactionsImported, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    synced: results.length,
    transactionsImported: totalImported,
    errors: errors.length,
    details: results,
  });
}
