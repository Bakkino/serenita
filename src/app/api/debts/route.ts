import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET /api/debts — Lista debiti e rateizzazioni
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const debts = await prisma.debt.findMany({
    where: { userId: user.id },
    include: {
      installments: {
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  // Statistiche
  const active = debts.filter((d) => d.status === "ACTIVE");
  const totalRemaining = active.reduce((s, d) => s + d.remainingAmount, 0);
  const overdueInstallments = active.flatMap((d) =>
    d.installments.filter((i) => !i.isPaid && i.dueDate < new Date())
  );

  return NextResponse.json({
    debts,
    stats: {
      totalDebts: debts.length,
      activeDebts: active.length,
      totalRemaining,
      overdueInstallments: overdueInstallments.length,
    },
  });
}

// Schema validazione
const debtSchema = z.object({
  type: z.enum(["RATEIZZAZIONE", "CARTELLA", "AVVISO_BONARIO", "MUTUO", "PRESTITO", "ALTRO"]),
  description: z.string().min(1),
  creditor: z.string().min(1),
  originalAmount: z.number().positive(),
  interestRate: z.number().min(0).optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  numberOfInstallments: z.number().int().positive().optional(),
  installmentAmount: z.number().positive().optional(),
});

// POST /api/debts — Crea nuovo debito con piano rate
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = debtSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const startDate = new Date(data.startDate);

  const debt = await prisma.debt.create({
    data: {
      userId: user.id,
      type: data.type,
      description: data.description,
      creditor: data.creditor,
      originalAmount: data.originalAmount,
      remainingAmount: data.originalAmount,
      interestRate: data.interestRate || null,
      startDate,
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: "ACTIVE",
    },
  });

  // Genera piano rate se specificato il numero di rate
  if (data.numberOfInstallments && data.numberOfInstallments > 0) {
    const installmentAmount =
      data.installmentAmount || data.originalAmount / data.numberOfInstallments;

    const installments = Array.from({ length: data.numberOfInstallments }, (_, i) => {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      return {
        debtId: debt.id,
        number: i + 1,
        amount: Math.round(installmentAmount * 100) / 100,
        dueDate,
        isPaid: false,
      };
    });

    await prisma.installment.createMany({ data: installments });
  }

  // Recupera il debito completo con rate
  const fullDebt = await prisma.debt.findUnique({
    where: { id: debt.id },
    include: { installments: { orderBy: { dueDate: "asc" } } },
  });

  return NextResponse.json({ debt: fullDebt }, { status: 201 });
}

// PATCH /api/debts — Aggiorna debito o segna rata come pagata
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();

  // Caso 1: Aggiorna una rata specifica
  if (body.installmentId) {
    const installment = await prisma.installment.findUnique({
      where: { id: body.installmentId },
      include: { debt: true },
    });

    if (!installment || installment.debt.userId !== user.id) {
      return NextResponse.json({ error: "Rata non trovata" }, { status: 404 });
    }

    await prisma.installment.update({
      where: { id: body.installmentId },
      data: {
        isPaid: body.isPaid ?? true,
        paidDate: body.isPaid !== false ? new Date() : null,
      },
    });

    // Aggiorna importo residuo del debito
    const allInstallments = await prisma.installment.findMany({
      where: { debtId: installment.debtId },
    });

    const remainingAmount = allInstallments
      .filter((i) => !i.isPaid)
      .reduce((s, i) => s + i.amount, 0);

    const allPaid = allInstallments.every((i) => i.isPaid);

    await prisma.debt.update({
      where: { id: installment.debtId },
      data: {
        remainingAmount,
        status: allPaid ? "COMPLETED" : "ACTIVE",
      },
    });

    return NextResponse.json({ success: true, remainingAmount });
  }

  // Caso 2: Aggiorna il debito stesso
  if (body.id) {
    const existing = await prisma.debt.findFirst({
      where: { id: body.id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Debito non trovato" }, { status: 404 });
    }

    const { id, ...updates } = body;
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.endDate) updates.endDate = new Date(updates.endDate);

    const debt = await prisma.debt.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ debt });
  }

  return NextResponse.json({ error: "ID debito o rata richiesto" }, { status: 400 });
}
