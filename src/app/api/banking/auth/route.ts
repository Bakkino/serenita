import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { startAuth } from "@/lib/enablebanking";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// POST /api/banking/auth
// Inizia il flusso di autorizzazione Open Banking
// Genera uno state random per protezione CSRF, lo salva nel DB, poi ritorna l'URL della banca
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const aspspName = body.aspsp_name;
  const aspspCountry = body.country;
  const iban = body.iban || undefined; // IBAN opzionale — necessario per banche come Fineco

  if (!aspspName || !aspspCountry) {
    return NextResponse.json({ error: "Seleziona una banca" }, { status: 400 });
  }

  try {
    // Genera state CSRF — salvato temporaneamente come VerificationToken
    const state = randomBytes(32).toString("hex");

    // Pulisci eventuali token scaduti o vecchi per questo utente
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: `banking_state_${user.id}`,
      },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: `banking_state_${user.id}`,
        token: state,
        expires: new Date(Date.now() + 10 * 60 * 1000), // Scade in 10 minuti
      },
    });

    // Debug: verifica che la chiave privata sia presente
    const keyPresent = !!process.env.ENABLE_BANKING_PRIVATE_KEY;
    const keyLength = process.env.ENABLE_BANKING_PRIVATE_KEY?.length || 0;
    const keyStart = process.env.ENABLE_BANKING_PRIVATE_KEY?.substring(0, 30) || "MISSING";
    console.log(`[banking-auth] Key present: ${keyPresent}, length: ${keyLength}, starts with: ${keyStart}`);

    const result = await startAuth({
      aspspName,
      aspspCountry,
      state,
      iban,
    });

    return NextResponse.json({ url: result.url, state });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[banking-auth] ERRORE COMPLETO:", msg);
    // Restituisci l'errore dettagliato al frontend per debug
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
