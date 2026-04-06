import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";

// GET /api/banking/status
// Stato di tutte le connessioni bancarie: conti, saldi, ultima sync, scadenza PSD2
export async function GET() {
  const user = await getCurrentUser();
  console.log("[banking-status] user:", user?.id || "NULL");

  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const sessions = await prisma.enableBankingSession.findMany({
    where: { userId: user.id },
    include: {
      bankAccount: {
        select: {
          id: true,
          name: true,
          iban: true,
          currentBalance: true,
          currency: true,
          type: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("[banking-status] sessions found:", sessions.length, sessions.map(s => ({ id: s.id, accountId: s.accountId, bankAccountId: s.bankAccountId, isActive: s.isActive })));

  const now = new Date();

  const connections = sessions.map((s) => {
    const daysUntilExpiry = s.validUntil
      ? differenceInDays(s.validUntil, now)
      : 0;

    let status: "connected" | "expiring" | "expired" | "error";
    if (!s.isActive) {
      status = "expired";
    } else if (s.lastSyncError) {
      status = "error";
    } else if (daysUntilExpiry <= 0) {
      status = "expired";
    } else if (daysUntilExpiry <= 14) {
      status = "expiring";
    } else {
      status = "connected";
    }

    return {
      id: s.id,
      bankName: s.aspspName || "Banca",
      country: s.aspspCountry,
      // IBAN mascherato: mostra solo le ultime 4 cifre
      ibanMasked: s.iban ? `••••${s.iban.slice(-4)}` : null,
      balance: s.bankAccount?.currentBalance ?? null,
      currency: s.bankAccount?.currency ?? "EUR",
      accountName: s.bankAccount?.name ?? null,
      accountType: s.bankAccount?.type ?? null,
      lastSyncAt: s.lastSyncAt,
      lastSyncError: s.lastSyncError,
      validUntil: s.validUntil,
      daysUntilExpiry: Math.max(0, daysUntilExpiry),
      isActive: s.isActive,
      status,
      syncCount: s.syncCount,
    };
  });

  return NextResponse.json({
    connections,
    totalAccounts: connections.length,
    activeAccounts: connections.filter((c) => c.status === "connected" || c.status === "expiring").length,
    hasExpiring: connections.some((c) => c.status === "expiring"),
    hasErrors: connections.some((c) => c.status === "error"),
  });
}
