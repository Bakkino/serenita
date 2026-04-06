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
  const aspspName = body.aspsp_name || "Intesa Sanpaolo";
  const aspspCountry = body.country || "IT";

  // Genera state CSRF — salvato temporaneamente come VerificationToken
  const state = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: `banking_state_${user.id}`,
      token: state,
      expires: new Date(Date.now() + 10 * 60 * 1000), // Scade in 10 minuti
    },
  });

  const result = await startAuth({
    aspspName,
    aspspCountry,
    state,
  });

  return NextResponse.json({ url: result.url, state });
}
