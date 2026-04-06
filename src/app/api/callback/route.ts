import { NextResponse } from "next/server";
import { confirmSession, getSession } from "@/lib/enablebanking";
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
  let sessionData: any;
  try {
    sessionData = await confirmSession(code);
  } catch (err) {
    console.error("Enable Banking session confirmation failed:", (err as Error).message);
    return NextResponse.redirect(
      `${appUrl}/connettori?error=Errore nella conferma bancaria. Riprova.`
    );
  }

  // Salva la risposta raw nel Provider per debug (temporaneo)
  await prisma.provider.updateMany({
    where: { userId, slug: "enable-banking" },
    data: { lastSyncError: `RAW: ${JSON.stringify(sessionData).slice(0, 500)}` },
  });

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
      data: { status: "CONNECTED" },
    });
  }

  // Estrai nome banca dalla risposta (se disponibile)
  const aspspName = sessionData.aspsp?.name || "Intesa Sanpaolo";
  const aspspCountry = sessionData.aspsp?.country || "IT";

  // Per ogni account ricevuto, crea EnableBankingSession e BankAccount
  // Struttura API Enable Banking:
  //   account.uid → ID univoco per chiamate API (saldi, transazioni)
  //   account.account_id.iban → IBAN
  //   account.name → nome titolare
  //   account.currency → valuta
  //   account.identification_hash → hash per matching tra sessioni
  const validUntil = sessionData.access?.valid_until
    ? new Date(sessionData.access.valid_until)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  let accountsCreated = 0;

  let accounts = sessionData.accounts || [];

  // Alcune banche (es. FinecoBank) non restituiscono gli account nella conferma sessione.
  // In quel caso, li recuperiamo con GET /sessions/{session_id}
  if (accounts.length === 0 && sessionData.session_id) {
    try {
      const sessionDetails = await getSession(sessionData.session_id);
      // GET /sessions restituisce accounts come array di UID + accounts_data con dettagli
      const accountUids: string[] = sessionDetails.accounts || [];
      const accountsData = sessionDetails.accounts_data || [];

      // Costruisci array di account nel formato che ci aspettiamo
      for (const uid of accountUids) {
        const detail = accountsData.find((a: any) => a.uid === uid) || {};
        accounts.push({
          uid,
          account_id: detail.account_id || {},
          name: detail.name || null,
          currency: detail.currency || "EUR",
          identification_hash: detail.identification_hash || null,
          product: detail.product || null,
        });
      }
    } catch (err) {
      console.error("[callback] Errore recupero account da sessione:", (err as Error).message);
    }
  }

  // Salva info debug aggiornata
  await prisma.provider.update({
    where: { id: provider.id },
    data: { lastSyncError: `ACCOUNTS_FOUND: ${accounts.length}, RAW: ${JSON.stringify(accounts).slice(0, 400)}` },
  });

  for (const account of accounts) {
    // uid è l'identificativo per le chiamate API (GET /accounts/{uid}/balances)
    const ebAccountId = account.uid || account.account_id?.value || account.identification_hash;
    if (!ebAccountId) continue;

    // IBAN può essere in account_id.iban o direttamente in account.iban
    const iban = account.account_id?.iban || account.iban || null;
    const currency = account.currency || "EUR";
    const accountName = account.name || account.product || (iban ? `Conto ${iban.slice(-4)}` : "Conto bancario");

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
          name: accountName,
          type: "CHECKING",
          iban,
          currency,
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
          aspspName,
          aspspCountry,
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
