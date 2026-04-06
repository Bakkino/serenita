import { prisma } from "@/lib/prisma";

// Auto-categorizzazione basata su keyword matching
// Cerca tra le categorie dell'utente se la descrizione matcha le regole (matchRules)
// Ritorna l'ID della categoria o null se nessuna corrisponde
export async function autoMatchCategory(
  userId: string,
  description: string
): Promise<string | null> {
  if (!description) return null;

  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true, matchRules: true },
  });

  const descLower = description.toLowerCase();

  for (const cat of categories) {
    // Controlla matchRules (array di keyword salvate come JSON)
    if (cat.matchRules && Array.isArray(cat.matchRules)) {
      for (const rule of cat.matchRules) {
        if (typeof rule === "string" && descLower.includes(rule.toLowerCase())) {
          return cat.id;
        }
      }
    }

    // Fallback: controlla se il nome categoria appare nella descrizione
    if (descLower.includes(cat.name.toLowerCase())) {
      return cat.id;
    }
  }

  return null;
}
