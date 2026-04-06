import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista banche italiane supportate da Enable Banking
// Nomi esatti come richiesto dall'API Enable Banking
const SUPPORTED_BANKS = [
  { name: "Intesa Sanpaolo", country: "IT", logo: "intesa" },
  { name: "FinecoBank", country: "IT", logo: "fineco" },
  { name: "Revolut", country: "LT", logo: "revolut" },
  { name: "N26", country: "DE", logo: "n26" },
  { name: "UniCredit", country: "IT", logo: "unicredit" },
  { name: "BNL", country: "IT", logo: "bnl" },
  { name: "BPER Banca", country: "IT", logo: "bper" },
  { name: "Banco BPM", country: "IT", logo: "bpm" },
  { name: "Crédit Agricole Italia", country: "IT", logo: "creditagricole" },
  { name: "ING", country: "IT", logo: "ing" },
  { name: "Mediolanum", country: "IT", logo: "mediolanum" },
  { name: "Monte dei Paschi di Siena", country: "IT", logo: "mps" },
];

// GET /api/banking/aspsps — lista banche disponibili
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  return NextResponse.json({ banks: SUPPORTED_BANKS });
}
