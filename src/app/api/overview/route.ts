import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // ── Saldi totali ────────────────────────────────────────
  const accounts = await prisma.bankAccount.findMany({
    where: { userId: user.id, isArchived: false, includeInTotal: true },
    include: { provider: { select: { name: true, slug: true, status: true, lastSyncAt: true } } },
    orderBy: { sortOrder: "asc" },
  });

  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  // ── Cash flow mese corrente ─────────────────────────────
  const monthTransactions = await prisma.transaction.findMany({
    where: { userId: user.id, date: { gte: monthStart, lte: monthEnd }, status: "COMPLETED" },
  });

  const monthIncome = monthTransactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = monthTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // ── Fatture scadute ─────────────────────────────────────
  const overdueInvoices = await prisma.invoice.findMany({
    where: { userId: user.id, status: "OVERDUE" },
  });

  const unpaidInvoices = await prisma.invoice.findMany({
    where: { userId: user.id, status: { in: ["SENT", "DELIVERED", "OVERDUE"] } },
  });

  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

  // ── Prossime scadenze fiscali ───────────────────────────
  const upcomingDeadlines = await prisma.taxDeadline.findMany({
    where: { userId: user.id, isPaid: false, dueDate: { gte: now } },
    orderBy: { dueDate: "asc" },
    take: 5,
  });

  const nextTaxAmount = upcomingDeadlines
    .slice(0, 3)
    .reduce((sum, d) => sum + (d.amount || d.estimatedAmount || 0), 0);

  // ── Debiti attivi ───────────────────────────────────────
  const activeDebts = await prisma.debt.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: {
      installments: {
        where: { isPaid: false },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
  });

  const totalDebtRemaining = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0);

  // ── Storico patrimonio (12 mesi) ────────────────────────
  const snapshots = await prisma.balanceSnapshot.findMany({
    where: {
      bankAccountId: { in: accounts.map((a) => a.id) },
      date: { gte: subMonths(now, 12) },
    },
    orderBy: { date: "asc" },
  });

  const netWorthHistory = snapshots.map((s) => ({
    month: format(s.date, "MMM"),
    value: s.balance,
  }));

  // ── Cash flow ultimi 6 mesi ─────────────────────────────
  const cashFlowHistory = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(now, i);
    const mStart = startOfMonth(m);
    const mEnd = endOfMonth(m);

    const txs = await prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: mStart, lte: mEnd }, status: "COMPLETED" },
    });

    cashFlowHistory.push({
      month: format(m, "MMM"),
      entrate: txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      uscite: txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    });
  }

  // ── Ultime transazioni ──────────────────────────────────
  const recentTransactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    include: {
      category: { select: { name: true, icon: true } },
      bankAccount: { select: { name: true, provider: { select: { slug: true } } } },
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  // ── Health Score ────────────────────────────────────────
  let healthScore = 75;
  if (totalBalance > 25000) healthScore += 10;
  if (overdueInvoices.length > 0) healthScore -= overdueInvoices.length * 8;
  if (nextTaxAmount > totalBalance * 0.3) healthScore -= 10;
  if (activeDebts.length === 0) healthScore += 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  // ── Runway ──────────────────────────────────────────────
  const avgMonthlyExpense = cashFlowHistory.reduce((s, m) => s + m.uscite, 0) / 6;
  const runway = avgMonthlyExpense > 0 ? Math.floor(totalBalance / avgMonthlyExpense) : 99;

  return NextResponse.json({
    totalBalance,
    monthIncome,
    monthExpense,
    cashFlow: monthIncome - monthExpense,
    unpaidTotal,
    overdueCount: overdueInvoices.length,
    overdueTotal,
    nextTaxAmount,
    totalDebtRemaining,
    healthScore,
    runway,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.currentBalance,
      icon: a.icon,
      color: a.color,
      provider: a.provider,
    })),
    netWorthHistory,
    cashFlowHistory,
    upcomingDeadlines: upcomingDeadlines.map((d) => ({
      id: d.id,
      type: d.type,
      description: d.description,
      dueDate: d.dueDate,
      amount: d.amount || d.estimatedAmount,
      isEstimate: !d.amount && !!d.estimatedAmount,
    })),
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category?.name || "Non categorizzata",
      categoryIcon: t.category?.icon,
      provider: t.bankAccount.provider.slug,
      accountName: t.bankAccount.name,
    })),
    activeDebts: activeDebts.map((d) => ({
      id: d.id,
      description: d.description,
      creditor: d.creditor,
      originalAmount: d.originalAmount,
      remainingAmount: d.remainingAmount,
      nextInstallment: d.installments[0] || null,
    })),
  });
}
