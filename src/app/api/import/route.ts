import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Papa from "papaparse";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORT CSV — Endpoint universale per importare dati
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Supporta diversi formati CSV:
// - Export bancari (Intesa, Fineco, Revolut, etc.)
// - Export dal commercialista (scadenze, debiti)
// - Fatture (lista con importi e scadenze)
//
// Il tipo di import è specificato nel query param `type`:
// - transactions: movimenti bancari
// - invoices: fatture
// - deadlines: scadenze fiscali
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const importType = formData.get("type") as string; // "transactions" | "invoices" | "deadlines"
  const accountId = formData.get("accountId") as string; // Per transazioni: a quale conto associare

  if (!file) {
    return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 });
  }

  const csvText = await file.text();
  const { data: rows, errors: parseErrors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  // Crea log di importazione
  const importLog = await prisma.importLog.create({
    data: {
      userId: user.id,
      source: "CSV_BANK",
      filename: file.name,
      recordsTotal: rows.length,
    },
  });

  let imported = 0;
  let skipped = 0;
  let errorsArr: any[] = [];

  try {
    switch (importType) {
      case "transactions":
        ({ imported, skipped, errorsArr } = await importTransactions(user.id, accountId, rows, importLog.id));
        break;
      case "invoices":
        ({ imported, skipped, errorsArr } = await importInvoices(user.id, rows, importLog.id));
        break;
      case "deadlines":
        ({ imported, skipped, errorsArr } = await importDeadlines(user.id, rows));
        break;
      default:
        return NextResponse.json({ error: "Tipo import non valido. Usa: transactions, invoices, deadlines" }, { status: 400 });
    }

    // Aggiorna log
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: {
        recordsImported: imported,
        recordsSkipped: skipped,
        recordsError: errorsArr.length,
        errors: errorsArr.length > 0 ? errorsArr : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      importId: importLog.id,
      total: rows.length,
      imported,
      skipped,
      errors: errorsArr.length,
      errorDetails: errorsArr.slice(0, 10), // Prime 10 errori
    });

  } catch (error: any) {
    return NextResponse.json({ error: "Errore durante l'import: " + error.message }, { status: 500 });
  }
}

// ── Import Transazioni ────────────────────────────────────────
// Il CSV deve avere almeno: data, importo, descrizione
// Colonne supportate: data/date, importo/amount, descrizione/description, 
//                     categoria/category, controparte/counterpart
async function importTransactions(userId: string, accountId: string, rows: any[], importLogId: string) {
  let imported = 0, skipped = 0;
  const errorsArr: any[] = [];

  // Carica categorie per auto-matching
  const categories = await prisma.category.findMany({ where: { userId } });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Normalizza i nomi delle colonne (supporta italiano e inglese)
      const date = row.data || row.date || row.data_operazione || row.data_valuta;
      const amount = row.importo || row.amount || row.ammontare;
      const description = row.descrizione || row.description || row.causale || row.operazione;

      if (!date || amount === undefined || !description) {
        errorsArr.push({ row: i + 1, error: "Campi obbligatori mancanti (data, importo, descrizione)" });
        continue;
      }

      // Parse data (supporta formati italiani e ISO)
      const parsedDate = parseFlexibleDate(date);
      if (!parsedDate) {
        errorsArr.push({ row: i + 1, error: `Data non valida: ${date}` });
        continue;
      }

      // Parse importo (supporta formato italiano con virgola)
      const parsedAmount = parseAmount(amount);
      if (isNaN(parsedAmount)) {
        errorsArr.push({ row: i + 1, error: `Importo non valido: ${amount}` });
        continue;
      }

      // Auto-categorizzazione
      const categoryId = autoMatchCategory(description, categories);

      // Check duplicati (stessa data + importo + descrizione)
      const existing = await prisma.transaction.findFirst({
        where: {
          userId,
          bankAccountId: accountId,
          date: parsedDate,
          amount: parsedAmount,
          description: description.toString().trim(),
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.transaction.create({
        data: {
          userId,
          bankAccountId: accountId,
          date: parsedDate,
          amount: parsedAmount,
          description: description.toString().trim(),
          counterpart: (row.controparte || row.counterpart || row.ordinante || row.beneficiario || "")?.toString().trim() || null,
          categoryId,
          status: "COMPLETED",
          importLogId,
        },
      });

      imported++;
    } catch (err: any) {
      errorsArr.push({ row: i + 1, error: err.message });
    }
  }

  return { imported, skipped, errorsArr };
}

// ── Import Fatture ────────────────────────────────────────────
async function importInvoices(userId: string, rows: any[], importLogId: string) {
  let imported = 0, skipped = 0;
  const errorsArr: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const number = row.numero || row.number || row.numero_fattura;
      const date = row.data || row.date || row.data_emissione;
      const dueDate = row.scadenza || row.due_date || row.data_scadenza;
      const amount = row.totale || row.total || row.importo || row.amount;

      if (!number || !date || !amount) {
        errorsArr.push({ row: i + 1, error: "Campi obbligatori mancanti" });
        continue;
      }

      const parsedDate = parseFlexibleDate(date);
      const parsedDueDate = dueDate ? parseFlexibleDate(dueDate) : null;
      const parsedAmount = parseAmount(amount);

      if (!parsedDate || isNaN(parsedAmount)) {
        errorsArr.push({ row: i + 1, error: "Data o importo non valido" });
        continue;
      }

      // Check duplicati
      const existing = await prisma.invoice.findFirst({
        where: { userId, number: number.toString() },
      });

      if (existing) { skipped++; continue; }

      const netAmount = row.imponibile ? parseAmount(row.imponibile) : parsedAmount / 1.22;
      const vatAmount = row.iva ? parseAmount(row.iva) : parsedAmount - netAmount;

      await prisma.invoice.create({
        data: {
          userId,
          type: (row.tipo || row.type || "emessa").toString().toUpperCase() === "RICEVUTA" ? "RICEVUTA" : "EMESSA",
          number: number.toString(),
          date: parsedDate,
          dueDate: parsedDueDate || new Date(parsedDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          netAmount,
          vatRate: row.aliquota_iva || 22,
          vatAmount,
          totalAmount: parsedAmount,
          status: resolveInvoiceStatus(row.stato || row.status, parsedDueDate),
          clientOrVendor: (row.cliente || row.client || row.fornitore || row.vendor || "Sconosciuto").toString(),
          clientVatNumber: (row.partita_iva || row.vat_number || "")?.toString() || null,
          importLogId,
        },
      });

      imported++;
    } catch (err: any) {
      errorsArr.push({ row: i + 1, error: err.message });
    }
  }

  return { imported, skipped, errorsArr };
}

// ── Import Scadenze Fiscali ───────────────────────────────────
async function importDeadlines(userId: string, rows: any[]) {
  let imported = 0, skipped = 0;
  const errorsArr: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const description = row.descrizione || row.description || row.scadenza;
      const dueDate = row.data || row.date || row.data_scadenza;
      const amount = row.importo || row.amount;

      if (!description || !dueDate) {
        errorsArr.push({ row: i + 1, error: "Descrizione e data obbligatori" });
        continue;
      }

      const parsedDate = parseFlexibleDate(dueDate);
      if (!parsedDate) {
        errorsArr.push({ row: i + 1, error: `Data non valida: ${dueDate}` });
        continue;
      }

      const parsedAmount = amount ? parseAmount(amount) : null;
      const tipo = (row.tipo || row.type || "altro").toString().toUpperCase();
      const taxType = ["IVA", "IRPEF", "INPS", "IRAP", "F24", "F23"].includes(tipo) ? tipo : "ALTRO";

      await prisma.taxDeadline.create({
        data: {
          userId,
          type: taxType as any,
          description: description.toString().trim(),
          dueDate: parsedDate,
          amount: parsedAmount,
          notes: (row.note || row.notes || "")?.toString() || null,
        },
      });

      imported++;
    } catch (err: any) {
      errorsArr.push({ row: i + 1, error: err.message });
    }
  }

  return { imported, skipped, errorsArr };
}

// ── Utility ───────────────────────────────────────────────────

function parseFlexibleDate(input: any): Date | null {
  if (!input) return null;
  const str = input.toString().trim();

  // ISO format: 2026-02-17
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);

  // Italian format: 17/02/2026
  const itMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (itMatch) return new Date(parseInt(itMatch[3]), parseInt(itMatch[2]) - 1, parseInt(itMatch[1]));

  // Try native parsing
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(input: any): number {
  if (typeof input === "number") return input;
  // Gestisce formato italiano: "1.234,56" → 1234.56
  const str = input.toString().trim()
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3})/g, "")  // Rimuove separatore migliaia
    .replace(",", ".");             // Virgola → punto decimale
  return parseFloat(str);
}

function autoMatchCategory(description: string, categories: any[]): string | null {
  const desc = description.toLowerCase();
  for (const cat of categories) {
    const rules = cat.matchRules as string[] | null;
    if (rules && rules.some((rule: string) => desc.includes(rule.toLowerCase()))) {
      return cat.id;
    }
  }
  return null;
}

function resolveInvoiceStatus(status: string | undefined, dueDate: Date | null): "DRAFT" | "SENT" | "DELIVERED" | "PAID" | "OVERDUE" | "CANCELLED" {
  if (!status) {
    if (dueDate && dueDate < new Date()) return "OVERDUE";
    return "SENT";
  }
  const s = status.toString().toLowerCase();
  if (["pagata", "paid", "incassata"].includes(s)) return "PAID";
  if (["scaduta", "overdue"].includes(s)) return "OVERDUE";
  if (["bozza", "draft"].includes(s)) return "DRAFT";
  if (["annullata", "cancelled"].includes(s)) return "CANCELLED";
  return "SENT";
}
