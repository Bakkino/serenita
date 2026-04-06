import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET /api/projects — Lista progetti
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const projects = await prisma.project.findMany({
    where: {
      userId: user.id,
      ...(status ? { status: status as any } : {}),
    },
    include: {
      invoices: { select: { id: true, totalAmount: true, status: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      _count: { select: { transactions: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  // Statistiche
  const active = projects.filter((p) =>
    ["CONFIRMED", "IN_PROGRESS"].includes(p.status)
  );
  const pipeline = projects.filter((p) => p.status === "PROPOSAL");
  const totalValue = active.reduce((s, p) => s + p.totalAmount, 0);
  const pipelineValue = pipeline.reduce(
    (s, p) => s + p.totalAmount * ((p.probability || 50) / 100),
    0
  );

  return NextResponse.json({
    projects,
    stats: {
      total: projects.length,
      active: active.length,
      pipeline: pipeline.length,
      totalValue,
      pipelineValue,
    },
  });
}

const projectSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  description: z.string().optional().nullable(),
  totalAmount: z.number().min(0),
  status: z.enum(["PROPOSAL", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "INVOICED", "PAID", "CANCELLED"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  probability: z.number().min(0).max(100).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// POST /api/projects — Crea nuovo progetto
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = projectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: data.name,
      client: data.client,
      description: data.description || null,
      totalAmount: data.totalAmount,
      status: data.status || "PROPOSAL",
      progress: data.progress || 0,
      probability: data.probability ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      deadline: data.deadline ? new Date(data.deadline) : null,
      notes: data.notes || null,
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}

// PATCH /api/projects — Aggiorna progetto
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "ID progetto richiesto" }, { status: 400 });
  }

  const existing = await prisma.project.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  // Converti date
  if (updates.startDate) updates.startDate = new Date(updates.startDate);
  if (updates.endDate) updates.endDate = new Date(updates.endDate);
  if (updates.deadline) updates.deadline = new Date(updates.deadline);

  const project = await prisma.project.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ project });
}
