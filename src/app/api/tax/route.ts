import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateDeadlinesForYear } from "@/lib/tax-calendar";

// GET /api/tax — Lista scadenze fiscali
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear().toString());
  const showPaid = url.searchParams.get("paid") === "true";
  const generateIfEmpty = url.searchParams.get("generate") === "true";

  let deadlines = await prisma.taxDeadline.findMany({
    where: {
      userId: user.id,
      dueDate: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
      ...(showPaid ? {} : {}), // Mostra tutte, il filtro è nel frontend
    },
    orderBy: { dueDate: "asc" },
  });

  // Se non ci sono scadenze per quest'anno e l'utente chiede di generarle
  if (deadlines.length === 0 && generateIfEmpty) {
    const templates = generateDeadlinesForYear(year);

    await prisma.taxDeadline.createMany({
      data: templates.map((t) => ({
        userId: user.id,
        type: t.type,
        description: t.description,
        dueDate: t.dueDate,
        isRecurring: true,
        recurringRule: t.recurringRule,
        f24Code: t.f24Code,
      })),
    });

    deadlines = await prisma.taxDeadline.findMany({
      where: {
        userId: user.id,
        dueDate: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  // Calcola statistiche
  const now = new Date();
  const unpaid = deadlines.filter((d) => !d.isPaid);
  const overdue = unpaid.filter((d) => d.dueDate < now);
  const upcoming = unpaid.filter(
    (d) => d.dueDate >= now && d.dueDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  );
  const totalDue = unpaid.reduce((s, d) => s + (d.amount || d.estimatedAmount || 0), 0);

  return NextResponse.json({
    deadlines,
    stats: {
      total: deadlines.length,
      paid: deadlines.filter((d) => d.isPaid).length,
      unpaid: unpaid.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      totalDue,
    },
  });
}

// Schema validazione
const taxSchema = z.object({
  type: z.enum(["IVA", "IRPEF", "INPS", "IRAP", "F24", "F23", "ALTRO"]),
  description: z.string().min(1),
  dueDate: z.string(),
  amount: z.number().optional().nullable(),
  estimatedAmount: z.number().optional().nullable(),
  f24Code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurringRule: z.string().optional().nullable(),
});

// POST /api/tax — Crea nuova scadenza
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = taxSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const deadline = await prisma.taxDeadline.create({
    data: {
      userId: user.id,
      type: parsed.data.type,
      description: parsed.data.description,
      dueDate: new Date(parsed.data.dueDate),
      amount: parsed.data.amount || null,
      estimatedAmount: parsed.data.estimatedAmount || null,
      f24Code: parsed.data.f24Code || null,
      notes: parsed.data.notes || null,
      isRecurring: parsed.data.isRecurring || false,
      recurringRule: parsed.data.recurringRule || null,
    },
  });

  return NextResponse.json({ deadline }, { status: 201 });
}

// PATCH /api/tax — Aggiorna scadenza (es. segna come pagata)
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "ID scadenza richiesto" }, { status: 400 });
  }

  const existing = await prisma.taxDeadline.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Scadenza non trovata" }, { status: 404 });
  }

  // Se viene segnata come pagata, registra data e importo
  if (updates.isPaid === true && !existing.isPaid) {
    updates.paidDate = updates.paidDate ? new Date(updates.paidDate) : new Date();
    if (!updates.paidAmount) {
      updates.paidAmount = existing.amount || existing.estimatedAmount;
    }
  }

  if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

  const deadline = await prisma.taxDeadline.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ deadline });
}
