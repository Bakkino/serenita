import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET /api/invoices — Lista fatture con filtri
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // EMESSA, RICEVUTA
  const status = url.searchParams.get("status"); // DRAFT, SENT, PAID, OVERDUE, etc.
  const client = url.searchParams.get("client");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const invoices = await prisma.invoice.findMany({
    where: {
      userId: user.id,
      ...(type ? { type: type as any } : {}),
      ...(status ? { status: status as any } : {}),
      ...(client ? { clientOrVendor: { contains: client, mode: "insensitive" } } : {}),
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
      project: { select: { id: true, name: true } },
      transactions: { select: { id: true, amount: true, date: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ invoices });
}

// Schema validazione per nuova fattura
const invoiceSchema = z.object({
  type: z.enum(["EMESSA", "RICEVUTA"]),
  number: z.string().min(1),
  date: z.string(),
  dueDate: z.string(),
  netAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(22),
  clientOrVendor: z.string().min(1),
  clientVatNumber: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  withholdingTax: z.number().optional().nullable(),
  status: z.enum(["DRAFT", "SENT", "DELIVERED", "PAID", "OVERDUE", "CANCELLED"]).optional(),
});

// POST /api/invoices — Crea nuova fattura
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = invoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const vatAmount = Math.round(data.netAmount * (data.vatRate / 100) * 100) / 100;
  const totalAmount = Math.round((data.netAmount + vatAmount) * 100) / 100;

  // Verifica unicità numero fattura
  const existing = await prisma.invoice.findFirst({
    where: { userId: user.id, number: data.number },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Fattura numero ${data.number} già esistente` },
      { status: 409 }
    );
  }

  const invoice = await prisma.invoice.create({
    data: {
      userId: user.id,
      type: data.type,
      number: data.number,
      date: new Date(data.date),
      dueDate: new Date(data.dueDate),
      netAmount: data.netAmount,
      vatRate: data.vatRate,
      vatAmount,
      totalAmount,
      withholdingTax: data.withholdingTax || null,
      status: data.status || "DRAFT",
      clientOrVendor: data.clientOrVendor,
      clientVatNumber: data.clientVatNumber || null,
      projectId: data.projectId || null,
      notes: data.notes || null,
    },
  });

  return NextResponse.json({ invoice }, { status: 201 });
}

// PATCH /api/invoices — Aggiorna fattura
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "ID fattura richiesto" }, { status: 400 });
  }

  // Verifica che la fattura appartenga all'utente
  const existing = await prisma.invoice.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
  }

  // Se cambia lo stato a PAID, registra la data di pagamento
  if (updates.status === "PAID" && !updates.paidDate) {
    updates.paidDate = new Date();
  }

  // Ricalcola IVA se cambia l'imponibile
  if (updates.netAmount !== undefined) {
    const vatRate = updates.vatRate ?? existing.vatRate;
    updates.vatAmount = Math.round(updates.netAmount * (vatRate / 100) * 100) / 100;
    updates.totalAmount = Math.round((updates.netAmount + updates.vatAmount) * 100) / 100;
  }

  // Converti stringhe date in Date
  if (updates.date) updates.date = new Date(updates.date);
  if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);
  if (updates.paidDate) updates.paidDate = new Date(updates.paidDate);

  const invoice = await prisma.invoice.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ invoice });
}
