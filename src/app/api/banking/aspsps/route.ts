import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Chiama l'API Enable Banking per ottenere la lista reale delle banche
// Cerca in IT + paesi dove hanno sede Revolut (LT) e N26 (DE)
async function fetchBanksFromAPI(): Promise<Array<{ name: string; country: string; logo: string }>> {
  const { generateJWT } = await import("@/lib/enablebanking");

  const countries = ["IT", "LT", "DE"]; // Italia + sedi Revolut e N26
  const allBanks: Array<{ name: string; country: string; logo: string }> = [];
  const seen = new Set<string>();

  for (const country of countries) {
    try {
      const jwt = generateJWT();
      const res = await fetch(
        `https://api.enablebanking.com/aspsps?country=${country}&psu_type=personal`,
        {
          headers: { Authorization: `Bearer ${jwt}` },
        }
      );

      if (!res.ok) continue;

      const data = await res.json();
      const aspsps = Array.isArray(data) ? data : data.aspsps || [];

      for (const bank of aspsps) {
        const key = `${bank.name}-${bank.country}`;
        if (seen.has(key)) continue;
        seen.add(key);

        allBanks.push({
          name: bank.name,
          country: bank.country,
          logo: bank.logo || "",
        });
      }
    } catch (err) {
      console.error(`[aspsps] Errore fetch banche ${country}:`, (err as Error).message);
    }
  }

  // Ordina: prima le italiane, poi alfabeticamente
  allBanks.sort((a, b) => {
    if (a.country === "IT" && b.country !== "IT") return -1;
    if (a.country !== "IT" && b.country === "IT") return 1;
    return a.name.localeCompare(b.name);
  });

  return allBanks;
}

// GET /api/banking/aspsps — lista banche disponibili da Enable Banking
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const banks = await fetchBanksFromAPI();
    return NextResponse.json({ banks });
  } catch (err) {
    console.error("[aspsps] Errore:", (err as Error).message);
    return NextResponse.json({ error: "Errore nel caricamento banche" }, { status: 500 });
  }
}
