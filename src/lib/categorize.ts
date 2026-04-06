import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Cerca una categoria il cui matchRules matchi la descrizione della transazione
// matchRules è un JSON array di stringhe: ["adobe", "creative cloud"]
// Se la descrizione contiene una di queste parole, la categoria è un match
export async function autoMatchCategory(
  userId: string,
  description: string
): Promise<string | null> {
  const categories = await prisma.category.findMany({
    where: { userId, matchRules: { not: Prisma.JsonNull } },
  });

  const descLower = description.toLowerCase();

  for (const cat of categories) {
    const rules = cat.matchRules as string[] | null;
    if (!rules || !Array.isArray(rules)) continue;

    const matches = rules.some((rule) =>
      descLower.includes(rule.toLowerCase())
    );

    if (matches) return cat.id;
  }

  return null;
}
