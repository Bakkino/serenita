import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { confirmSession } from "@/lib/enablebanking";
import { prisma } from "@/lib/prisma";

// GET /api/callback?code=xxx&state=yyy
// Callback dopo che l'utente autorizza l'accesso bancario
// Valida lo state CSRF, conferma la sessione, crea i record nel DB
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const appUrl = "https://serenita-lime.vercel.app";

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/connettori?error=Parametri mancanti dal callback bancario`
    );
  }

  // Valida lo state CSRF
  const storedState = await prisma.verificationToken.findFirst({
    where: {
      token: state,
      identifier: { startsWith: "banking_state_" },
      expires: { gt: new Date() },
    },
  });

  if (!storedState) {
    return NextResponse.redirect(
      `${appUrl}/connettori?error=Sessione scaduta o non valida. Riprova.`
    );
  }

  // Estrai userId dallo state identifier
  const userId = storedState.identifier.replace("banking_state_", "");

  // Rimuovi il token usato
  await prisma.verificationToken.delete({
    where: {
      identifier_token: {
        identifier: storedState.identifier,
        token: state,
      },
    },
  });

  // Conferma la sessione con Enable Banking
  let sessionData;
  try {
    sessionData = await confirmSession(code);
  } catch (err) {
    console.error("Enable Banking session confirmation failed:", (err as Error).message);
    return NextResponse.redirect(
      `${appUrl}/connettori?error=Errore nella conferma bancaria. Riprova.`
    );
  }

  // Cerca o crea il Provider "Enable Banking" per l'utente
  let provider = await prisma.provider.findFirst({
    where: { userId, slug: "enable-banking" },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        userId,
        slug: "enable-banking",
        name: "Enable Banking",
        type: "BANK",
        status: "CONNECTED",
        aggregator: "enablebanking",
        syncEnabled: true,
      },
    });
  } else {
    await prisma.provider.update({
      where: { id: provider.id },
      data: { status: "CONNECTED", lastSyncError: null },
    });
  }

  // Per ogni account ricevuto, crea EnableBankingSession e BankAccount
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  let accountsCreated = 0;

  for (const account of sessionData.accounts) {
    const ebAccountId = account.account_id?.value;
    if (!ebAccountId) continue;

    const iban = account.iban || null;

    // Cerca se esiste già un BankAccount con questo IBAN
    let bankAccount = iban
      ? await prisma.bankAccount.findFirst({
          where: { userId, iban },
        })
      : null;

    if (!bankAccount) {
      // Crea nuovo BankAccount
      bankAccount = await prisma.bankAccount.create({
        data: {
          userId,
          providerId: provider.id,
          name: account.account_name || (iban ? `Conto ${iban.slice(-4)}` : "Conto bancario"),
          type: "CHECKING",
          iban,
          currency: "EUR",
          currentBalance: 0,
        },
      });
      accountsCreated++;
    }

    // Crea o aggiorna EnableBankingSession
    const existingSession = await prisma.enableBankingSession.findFirst({
      where: { userId, accountId: ebAccountId },
    });

    if (existingSession) {
      await prisma.enableBankingSession.update({
        where: { id: existingSession.id },
        data: {
          sessionId: sessionData.session_id,
          bankAccountId: bankAccount.id,
          iban,
          validUntil,
          isActive: true,
          lastSyncError: null,
        },
      });
    } else {
      await prisma.enableBankingSession.create({
        data: {
          userId,
          sessionId: sessionData.session_id,
          accountId: ebAccountId,
          bankAccountId: bankAccount.id,
          iban,
          aspspName: "Intesa Sanpaolo", // TODO: passare dalla sessione
          aspspCountry: "IT",
          validUntil,
          isActive: true,
        },
      });
    }
  }

  return NextResponse.redirect(
    `${appUrl}/connettori?success=Banca collegata con successo! ${accountsCreated > 0 ? `${accountsCreated} nuovi conti trovati.` : "Conti aggiornati."}`
  );
}
