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
  const debugInfo: string[] = [];
  debugInfo.push(`CONFIRM: ${JSON.stringify(sessionData).slice(0, 300)}`);

  await prisma.provider.updateMany({
    where: { userId, slug: "enable-banking" },
    data: { lastSyncError: debugInfo.join(" | ") },
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
      debugInfo.push(`GET_SESSION: ${JSON.stringify(sessionDetails).slice(0, 400)}`);

      // GET /sessions può restituire accounts in diversi formati:
      // 1. Array di oggetti completi (come POST /sessions)
      // 2. Array di UID stringa + accounts_data separato
      const rawAccounts = sessionDetails.accounts || [];

      if (rawAccounts.length > 0) {
        if (typeof rawAccounts[0] === "string") {
          // Formato: array di UID stringa
          const accountsData = sessionDetails.accounts_data || [];
          for (const uid of rawAccounts) {
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
        } else {
          // Formato: array di oggetti account completi
          accounts = rawAccounts;
        }
      }
    } catch (err) {
      debugInfo.push(`GET_SESSION_ERR: ${(err as Error).message}`);
    }
  }

  debugInfo.push(`ACCOUNTS_FOUND: ${accounts.length}`);
  if (accounts.length > 0) {
    debugInfo.push(`ACCOUNTS: ${JSON.stringify(accounts).slice(0, 300)}`);
  }

  // Salva debug in VerificationToken (non viene cancellato dal sync)
  const debugToken = debugInfo.join(" | ").slice(0, 900);
  await prisma.verificationToken.create({
    data: {
      identifier: `debug_callback_${userId}`,
      token: debugToken,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 giorni
    },
  }).catch(() => {
    // Se esiste già, aggiorna
    return prisma.verificationToken.updateMany({
      where: { identifier: `debug_callback_${userId}` },
      data: { token: debugToken },
    });
  });

  // Salva anche nel provider
  await prisma.provider.update({
    where: { id: provider.id },
    data: { lastSyncError: debugToken },
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
