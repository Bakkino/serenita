import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Utente ──────────────────────────────────────────────
  const passwordHash = await hash("serenita2026!", 12);
  
  const user = await prisma.user.upsert({
    where: { email: "paolo@wearemakers.it" },
    update: {},
    create: {
      email: "paolo@wearemakers.it",
      name: "Paolo",
      passwordHash,
    },
  });
  
  console.log("✅ Utente creato:", user.email);

  // ── Provider ────────────────────────────────────────────
  const providers = await Promise.all([
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "intesa" } },
      update: {},
      create: {
        userId: user.id,
        slug: "intesa",
        name: "Intesa Sanpaolo",
        type: "BANK",
        status: "CONNECTED",
        aggregator: "tink",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "fineco" } },
      update: {},
      create: {
        userId: user.id,
        slug: "fineco",
        name: "FinecoBank",
        type: "BANK",
        status: "CONNECTED",
        aggregator: "tink",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "revolut" } },
      update: {},
      create: {
        userId: user.id,
        slug: "revolut",
        name: "Revolut",
        type: "BANK",
        status: "CONNECTED",
        aggregator: "direct",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "paypal" } },
      update: {},
      create: {
        userId: user.id,
        slug: "paypal",
        name: "PayPal",
        type: "PAYMENT",
        status: "CONNECTED",
        aggregator: "direct",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "satispay" } },
      update: {},
      create: {
        userId: user.id,
        slug: "satispay",
        name: "Satispay",
        type: "PAYMENT",
        status: "CONNECTED",
        aggregator: "direct",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "sdi" } },
      update: {},
      create: {
        userId: user.id,
        slug: "sdi",
        name: "Fatture Elettroniche (SDI)",
        type: "FISCAL",
        status: "CONNECTED",
        lastSyncAt: new Date(),
      },
    }),
    prisma.provider.upsert({
      where: { userId_slug: { userId: user.id, slug: "ade" } },
      update: {},
      create: {
        userId: user.id,
        slug: "ade",
        name: "Agenzia delle Entrate",
        type: "FISCAL",
        status: "ERROR",
        lastSyncError: "Errore autenticazione SPID. Riconnetti.",
        lastSyncAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  const [intesa, fineco, revolut, paypal, satispay] = providers;
  console.log("✅ Provider creati:", providers.length);

  // ── Conti Bancari ───────────────────────────────────────
  const accounts = await Promise.all([
    prisma.bankAccount.create({
      data: {
        userId: user.id,
        providerId: intesa.id,
        name: "Conto Principale Intesa",
        type: "CHECKING",
        iban: "IT60X0542811101000000123456",
        currentBalance: 18420.55,
        icon: "🏦",
        color: "#5B7F95",
        sortOrder: 1,
      },
    }),
    prisma.bankAccount.create({
      data: {
        userId: user.id,
        providerId: fineco.id,
        name: "Conto Fineco",
        type: "CHECKING",
        iban: "IT40L0301503200000003456789",
        currentBalance: 7890.20,
        icon: "🏦",
        color: "#8B6F47",
        sortOrder: 2,
      },
    }),
    prisma.bankAccount.create({
      data: {
        userId: user.id,
        providerId: revolut.id,
        name: "Revolut EUR",
        type: "WALLET",
        currentBalance: 3245.80,
        icon: "💳",
        color: "#6B8E6B",
        sortOrder: 3,
      },
    }),
    prisma.bankAccount.create({
      data: {
        userId: user.id,
        providerId: paypal.id,
        name: "PayPal Business",
        type: "WALLET",
        currentBalance: 1580.00,
        icon: "🅿️",
        color: "#9B7C8E",
        sortOrder: 4,
      },
    }),
    prisma.bankAccount.create({
      data: {
        userId: user.id,
        providerId: satispay.id,
        name: "Satispay Business",
        type: "WALLET",
        currentBalance: 420.30,
        icon: "📱",
        color: "#C4944A",
        sortOrder: 5,
      },
    }),
  ]);

  const [accIntesa, accFineco, accRevolut, accPaypal, accSatispay] = accounts;
  console.log("✅ Conti creati:", accounts.length);

  // ── Categorie ───────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.create({ data: { userId: user.id, name: "Lavoro", type: "INCOME", icon: "💼", color: "#5B8C5A", isSystem: true, matchRules: ["bonifico", "pagamento fattura", "compenso"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Affitto", type: "EXPENSE", icon: "🏠", color: "#5B7F95", monthlyBudget: 900, isSystem: true, matchRules: ["canone", "affitto", "locazione"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Software", type: "EXPENSE", icon: "💻", color: "#8B6F47", monthlyBudget: 400, isSystem: true, matchRules: ["adobe", "creative cloud", "notion", "figma", "chatgpt", "midjourney"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Trasporto", type: "EXPENSE", icon: "🚗", color: "#6B8E6B", monthlyBudget: 350, isSystem: true, matchRules: ["benzina", "autostrada", "treno", "italo", "trenitalia", "taxi"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Ristorante", type: "EXPENSE", icon: "🍽️", color: "#9B7C8E", monthlyBudget: 250, isSystem: true, matchRules: ["ristorante", "osteria", "trattoria", "bar", "pranzo", "cena"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Utenze", type: "EXPENSE", icon: "⚡", color: "#7B8FA1", monthlyBudget: 250, isSystem: true, matchRules: ["enel", "eni", "tim", "vodafone", "fastweb", "hera"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Assicurazione", type: "EXPENSE", icon: "🛡️", color: "#A08B6F", isSystem: true, matchRules: ["assicurazione", "polizza", "generali", "allianz"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Formazione", type: "EXPENSE", icon: "📚", color: "#6F8B7B", isSystem: true, matchRules: ["corso", "workshop", "formazione", "udemy", "masterclass"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Attrezzatura", type: "EXPENSE", icon: "🎥", color: "#8E7B6F", isSystem: true, matchRules: ["amazon", "b&h", "adorama", "camera", "lens"] } }),
    prisma.category.create({ data: { userId: user.id, name: "Trasferimento", type: "TRANSFER", icon: "↔️", color: "#8E8E8E", isSystem: true, matchRules: ["ricarica", "giroconto", "trasferimento"] } }),
  ]);

  const [catLavoro, catAffitto, catSoftware, catTrasporto, catRistorante, catUtenze, catAssicurazione, catFormazione, catAttrezzatura, catTrasferimento] = categories;
  console.log("✅ Categorie create:", categories.length);

  // ── Transazioni (ultimi 2 mesi) ────────────────────────
  const transactions = [
    // Febbraio 2026
    { bankAccountId: accIntesa.id, date: "2026-02-17", amount: 3600, description: "Bonifico da TechVentures Srl - Saldo FE-2026-011", categoryId: catLavoro.id, counterpart: "TechVentures Srl", status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-02-16", amount: -850, description: "Canone Affitto Studio Febbraio", categoryId: catAffitto.id, counterpart: "Immobiliare Fabriano", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accFineco.id, date: "2026-02-15", amount: -65.49, description: "Adobe Creative Cloud - Abbonamento mensile", categoryId: catSoftware.id, counterpart: "Adobe Systems", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accPaypal.id, date: "2026-02-15", amount: 1200, description: "Pagamento Campagna Social - 2° tranche", categoryId: catLavoro.id, counterpart: "TechVentures Srl", status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-02-14", amount: -500, description: "Ricarica Revolut", categoryId: catTrasferimento.id, counterpart: "Revolut", status: "COMPLETED" as const },
    { bankAccountId: accSatispay.id, date: "2026-02-14", amount: -42.50, description: "Pranzo di lavoro - Osteria del Moro", categoryId: catRistorante.id, counterpart: "Osteria del Moro", status: "COMPLETED" as const },
    { bankAccountId: accRevolut.id, date: "2026-02-13", amount: 2400, description: "Pagamento Corso Video Online - Acconto", categoryId: catLavoro.id, counterpart: "Marketers Srl", status: "COMPLETED" as const },
    { bankAccountId: accFineco.id, date: "2026-02-12", amount: -75.00, description: "IP Distributore - Via Roma Fabriano", categoryId: catTrasporto.id, counterpart: "IP", status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-02-10", amount: -29.99, description: "ChatGPT Plus - Abbonamento mensile", categoryId: catSoftware.id, counterpart: "OpenAI", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accFineco.id, date: "2026-02-08", amount: -180.00, description: "Bolletta Enel Energia", categoryId: catUtenze.id, counterpart: "Enel Energia", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-02-05", amount: -150.00, description: "Polizza RC Professionale - Rata mensile", categoryId: catAssicurazione.id, counterpart: "Generali Italia", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accPaypal.id, date: "2026-02-03", amount: -45.00, description: "Frame.io - Team Plan", categoryId: catSoftware.id, counterpart: "Frame.io", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-02-01", amount: 1800, description: "Bonifico da GreenTech Italia - Saldo FE-2026-008", categoryId: catLavoro.id, counterpart: "GreenTech Italia", status: "COMPLETED" as const },

    // Gennaio 2026
    { bankAccountId: accIntesa.id, date: "2026-01-28", amount: -850, description: "Canone Affitto Studio Gennaio", categoryId: catAffitto.id, counterpart: "Immobiliare Fabriano", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accRevolut.id, date: "2026-01-25", amount: 1500, description: "Pagamento Workshop AI Creatività", categoryId: catLavoro.id, counterpart: "Privato", status: "COMPLETED" as const },
    { bankAccountId: accFineco.id, date: "2026-01-20", amount: -65.49, description: "Adobe Creative Cloud - Abbonamento mensile", categoryId: catSoftware.id, counterpart: "Adobe Systems", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-01-16", amount: -680, description: "F24 - Rata rateizzazione Avviso Bonario (3/12)", categoryId: null, counterpart: "Agenzia delle Entrate", status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-01-16", amount: -1650, description: "F24 - IVA Liquidazione Dicembre 2025", categoryId: null, counterpart: "Agenzia delle Entrate", status: "COMPLETED" as const },
    { bankAccountId: accPaypal.id, date: "2026-01-15", amount: 2800, description: "Pagamento Brand Video - Acconto", categoryId: catLavoro.id, counterpart: "GreenTech Italia", status: "COMPLETED" as const },
    { bankAccountId: accIntesa.id, date: "2026-01-10", amount: -89.90, description: "Midjourney - Abbonamento annuale", categoryId: catSoftware.id, counterpart: "Midjourney", status: "COMPLETED" as const },
    { bankAccountId: accFineco.id, date: "2026-01-08", amount: -180.00, description: "Bolletta Enel Energia", categoryId: catUtenze.id, counterpart: "Enel Energia", isRecurring: true, status: "COMPLETED" as const },
    { bankAccountId: accSatispay.id, date: "2026-01-05", amount: -38.00, description: "Pranzo con cliente - Trattoria da Mario", categoryId: catRistorante.id, counterpart: "Trattoria da Mario", status: "COMPLETED" as const },
  ];

  for (const tx of transactions) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        bankAccountId: tx.bankAccountId,
        date: new Date(tx.date),
        amount: tx.amount,
        description: tx.description,
        categoryId: tx.categoryId,
        counterpart: tx.counterpart,
        isRecurring: tx.isRecurring || false,
        status: tx.status,
      },
    });
  }
  console.log("✅ Transazioni create:", transactions.length);

  // ── Fatture ─────────────────────────────────────────────
  const invoices = [
    { number: "FE-2026-012", type: "EMESSA" as const, date: "2026-02-10", dueDate: "2026-03-10", netAmount: 3934.43, vatRate: 22, vatAmount: 865.57, totalAmount: 4800, status: "SENT" as const, clientOrVendor: "Marketers Srl", clientVatNumber: "IT03456789012" },
    { number: "FE-2026-011", type: "EMESSA" as const, date: "2026-01-28", dueDate: "2026-02-28", netAmount: 2950.82, vatRate: 22, vatAmount: 649.18, totalAmount: 3600, status: "PAID" as const, clientOrVendor: "TechVentures Srl", clientVatNumber: "IT09876543210", paidDate: "2026-02-17" },
    { number: "FE-2026-010", type: "EMESSA" as const, date: "2026-01-15", dueDate: "2026-02-15", netAmount: 1803.28, vatRate: 22, vatAmount: 396.72, totalAmount: 2200, status: "OVERDUE" as const, clientOrVendor: "Studio Legale Rossi", clientVatNumber: "IT01234567890" },
    { number: "FE-2026-009", type: "EMESSA" as const, date: "2026-01-10", dueDate: "2026-02-10", netAmount: 4508.20, vatRate: 22, vatAmount: 991.80, totalAmount: 5500, status: "OVERDUE" as const, clientOrVendor: "Fondazione Arte Moderna", clientVatNumber: "IT05678901234" },
    { number: "FE-2026-008", type: "EMESSA" as const, date: "2026-01-05", dueDate: "2026-02-05", netAmount: 1475.41, vatRate: 22, vatAmount: 324.59, totalAmount: 1800, status: "PAID" as const, clientOrVendor: "GreenTech Italia", clientVatNumber: "IT07890123456", paidDate: "2026-02-01" },
  ];

  for (const inv of invoices) {
    await prisma.invoice.create({
      data: {
        userId: user.id,
        type: inv.type,
        number: inv.number,
        date: new Date(inv.date),
        dueDate: new Date(inv.dueDate),
        netAmount: inv.netAmount,
        vatRate: inv.vatRate,
        vatAmount: inv.vatAmount,
        totalAmount: inv.totalAmount,
        status: inv.status,
        clientOrVendor: inv.clientOrVendor,
        clientVatNumber: inv.clientVatNumber,
        paidDate: inv.paidDate ? new Date(inv.paidDate) : null,
        sdiStatus: inv.status === "PAID" ? "consegnata" : inv.status === "SENT" ? "in_elaborazione" : "consegnata",
      },
    });
  }
  console.log("✅ Fatture create:", invoices.length);

  // ── Debiti / Rateizzazioni ──────────────────────────────
  const debt1 = await prisma.debt.create({
    data: {
      userId: user.id,
      type: "AVVISO_BONARIO",
      description: "Rateizzazione Avviso Bonario 2023",
      creditor: "Agenzia delle Entrate",
      originalAmount: 8160,
      remainingAmount: 4760,
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      status: "ACTIVE",
    },
  });

  // Rate per debt1
  for (let i = 1; i <= 12; i++) {
    const dueDate = new Date(2025, 6 + i, i <= 6 ? 30 : 31); // Approssimativo
    await prisma.installment.create({
      data: {
        debtId: debt1.id,
        number: i,
        amount: 680,
        dueDate,
        isPaid: i <= 5,
        paidDate: i <= 5 ? dueDate : null,
      },
    });
  }

  const debt2 = await prisma.debt.create({
    data: {
      userId: user.id,
      type: "RATEIZZAZIONE",
      description: "Rata Contributi INPS Arretrati",
      creditor: "INPS",
      originalAmount: 3200,
      remainingAmount: 1600,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-04-30"),
      status: "ACTIVE",
    },
  });

  for (let i = 1; i <= 8; i++) {
    const dueDate = new Date(2025, 8 + i, 16);
    await prisma.installment.create({
      data: {
        debtId: debt2.id,
        number: i,
        amount: 400,
        dueDate,
        isPaid: i <= 4,
        paidDate: i <= 4 ? dueDate : null,
      },
    });
  }
  console.log("✅ Debiti e rate creati");

  // ── Scadenze Fiscali ────────────────────────────────────
  const taxDeadlines = [
    { type: "IVA" as const, description: "IVA - Liquidazione mensile Febbraio 2026", dueDate: "2026-03-16", amount: 1840 },
    { type: "ALTRO" as const, description: "Rata Rateizzazione Avviso Bonario (4/12)", dueDate: "2026-03-31", amount: 680 },
    { type: "IVA" as const, description: "IVA - Liquidazione mensile Marzo 2026", dueDate: "2026-04-16", estimatedAmount: 1500 },
    { type: "INPS" as const, description: "INPS - Rata contributi arretrati (5/8)", dueDate: "2026-04-16", amount: 400 },
    { type: "IRPEF" as const, description: "Saldo IRPEF 2025 + 1° Acconto IRPEF 2026", dueDate: "2026-06-30", estimatedAmount: 4200 },
    { type: "INPS" as const, description: "Contributi INPS Gestione Separata - Saldo 2025", dueDate: "2026-06-30", estimatedAmount: 2800 },
    { type: "IRPEF" as const, description: "2° Acconto IRPEF 2026", dueDate: "2026-11-30", estimatedAmount: 2100 },
    { type: "INPS" as const, description: "INPS Gestione Separata - 2° Acconto 2026", dueDate: "2026-11-30", estimatedAmount: 1400 },
  ];

  for (const td of taxDeadlines) {
    await prisma.taxDeadline.create({
      data: {
        userId: user.id,
        type: td.type,
        description: td.description,
        dueDate: new Date(td.dueDate),
        amount: td.amount || null,
        estimatedAmount: td.estimatedAmount || null,
        isRecurring: td.type === "IVA",
      },
    });
  }
  console.log("✅ Scadenze fiscali create:", taxDeadlines.length);

  // ── Progetti ────────────────────────────────────────────
  const projects = [
    { name: "Video Corso AI per Creativi", client: "Marketers Srl", totalAmount: 12000, invoicedAmount: 4800, paidAmount: 0, status: "IN_PROGRESS" as const, progress: 60, startDate: "2026-01-15", deadline: "2026-04-30" },
    { name: "Docufilm Artigianato Marchigiano", client: "Fondazione Arte Moderna", totalAmount: 8000, invoicedAmount: 5500, paidAmount: 0, status: "IN_PROGRESS" as const, progress: 85, startDate: "2025-11-01", deadline: "2026-03-15" },
    { name: "Brand Video GreenTech", client: "GreenTech Italia", totalAmount: 3600, invoicedAmount: 3600, paidAmount: 3600, status: "PAID" as const, progress: 100, startDate: "2025-12-01", endDate: "2026-01-31" },
    { name: "Campagna Social TechVentures", client: "TechVentures Srl", totalAmount: 7200, invoicedAmount: 3600, paidAmount: 3600, status: "IN_PROGRESS" as const, progress: 50, startDate: "2026-01-20", deadline: "2026-05-31" },
    { name: "Corporate Video Luxury Hotels", client: "Luxe Hotels Group", totalAmount: 15000, invoicedAmount: 0, paidAmount: 0, status: "PROPOSAL" as const, progress: 0, probability: 65 },
    { name: "Training Video AI Tools - Internal", client: "Marketers Srl", totalAmount: 4500, invoicedAmount: 0, paidAmount: 0, status: "CONFIRMED" as const, progress: 0, startDate: "2026-03-01", deadline: "2026-04-15" },
  ];

  for (const p of projects) {
    await prisma.project.create({
      data: {
        userId: user.id,
        name: p.name,
        client: p.client,
        totalAmount: p.totalAmount,
        invoicedAmount: p.invoicedAmount,
        paidAmount: p.paidAmount,
        status: p.status,
        progress: p.progress,
        probability: p.probability || null,
        startDate: p.startDate ? new Date(p.startDate) : null,
        endDate: p.endDate ? new Date(p.endDate) : null,
        deadline: p.deadline ? new Date(p.deadline) : null,
      },
    });
  }
  console.log("✅ Progetti creati:", projects.length);

  // ── Balance Snapshots (storico 12 mesi) ─────────────────
  const monthlyBalances = [
    { month: "2025-03", balance: 22100 }, { month: "2025-04", balance: 24500 },
    { month: "2025-05", balance: 21800 }, { month: "2025-06", balance: 26200 },
    { month: "2025-07", balance: 28900 }, { month: "2025-08", balance: 25100 },
    { month: "2025-09", balance: 29800 }, { month: "2025-10", balance: 31200 },
    { month: "2025-11", balance: 28400 }, { month: "2025-12", balance: 30100 },
    { month: "2026-01", balance: 29800 }, { month: "2026-02", balance: 31556 },
  ];

  for (const snap of monthlyBalances) {
    await prisma.balanceSnapshot.create({
      data: {
        bankAccountId: accIntesa.id,
        date: new Date(snap.month + "-28"),
        balance: snap.balance,
      },
    });
  }
  console.log("✅ Snapshot saldi creati:", monthlyBalances.length);

  console.log("\n🎉 Seed completato! Database pronto.");
  console.log("📧 Login: paolo@wearemakers.it");
  console.log("🔑 Password: serenita2026!");
}

main()
  .catch((e) => {
    console.error("❌ Errore seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
