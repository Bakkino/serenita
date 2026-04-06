import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Forza esecuzione dinamica (no cache)
export const dynamic = "force-dynamic";

// TEMPORANEO — endpoint di debug per verificare lo stato del database
// Da rimuovere dopo il debug
export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });

  const providers = await prisma.provider.findMany({
    select: { id: true, userId: true, slug: true, name: true, status: true, lastSyncError: true },
  });

  const sessions = await prisma.enableBankingSession.findMany({
    select: {
      id: true,
      userId: true,
      sessionId: true,
      accountId: true,
      bankAccountId: true,
      iban: true,
      aspspName: true,
      isActive: true,
      validUntil: true,
    },
  });

  const bankAccounts = await prisma.bankAccount.findMany({
    select: {
      id: true,
      userId: true,
      providerId: true,
      name: true,
      iban: true,
      currentBalance: true,
    },
  });

  return NextResponse.json({
    users,
    providers,
    sessions,
    bankAccounts,
  });
}
