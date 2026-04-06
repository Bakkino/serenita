import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

// GET /api/export/transactions — Export CSV transazioni
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const accountId = url.searchParams.get("account");

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      ...(accountId ? { bankAccountId: accountId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      bankAccount: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  // Genera CSV
  const header = "Data,Descrizione,Importo,Valuta,Categoria,Conto,Controparte,Riferimento,Stato";
  const rows = transactions.map((t) =>
    [
      format(t.date, "dd/MM/yyyy"),
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount.toFixed(2).replace(".", ","),
      t.currency,
      t.category?.name || "",
      t.bankAccount.name,
      t.counterpart || "",
      t.reference || "",
      t.status,
    ].join(";")
  );

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transazioni_${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
