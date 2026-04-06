import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFatturaPA } from "@/lib/xml-parser";

// POST /api/invoices/import — Importa fatture da XML FatturaPA
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 });
  }

  const results: Array<{
    filename: string;
    success: boolean;
    invoiceNumber?: string;
    error?: string;
  }> = [];

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    // Validazione dimensione (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      results.push({
        filename: file.name,
        success: false,
        error: "File troppo grande (max 5MB)",
      });
      errors++;
      continue;
    }

    // Validazione tipo file
    if (!file.name.endsWith(".xml") && !file.name.endsWith(".p7m")) {
      results.push({
        filename: file.name,
        success: false,
        error: "Formato non supportato (solo .xml e .p7m)",
      });
      errors++;
      continue;
    }

    try {
      let xmlContent = await file.text();

      // Se è un .p7m, prova a estrarre l'XML (semplificato — il .p7m è firmato)
      // In un caso reale servirebbe una libreria per i CAdES
      if (file.name.endsWith(".p7m")) {
        const xmlStart = xmlContent.indexOf("<?xml");
        if (xmlStart === -1) {
          results.push({
            filename: file.name,
            success: false,
            error: "Impossibile estrarre XML dal file .p7m",
          });
          errors++;
          continue;
        }
        xmlContent = xmlContent.substring(xmlStart);
      }

      // Parse
      const parsed = parseFatturaPA(xmlContent);

      // Deduplicazione per numero fattura + anno
      const year = new Date(parsed.date).getFullYear();
      const existing = await prisma.invoice.findFirst({
        where: {
          userId: user.id,
          number: parsed.number,
          date: {
            gte: new Date(year, 0, 1),
            lt: new Date(year + 1, 0, 1),
          },
        },
      });

      if (existing) {
        results.push({
          filename: file.name,
          success: false,
          invoiceNumber: parsed.number,
          error: `Fattura ${parsed.number} già presente`,
        });
        skipped++;
        continue;
      }

      // Crea log di import
      const importLog = await prisma.importLog.create({
        data: {
          userId: user.id,
          source: "XML_SDI",
          filename: file.name,
          recordsTotal: 1,
          recordsImported: 1,
        },
      });

      // Determina stato
      let status: "DRAFT" | "SENT" | "DELIVERED" | "PAID" | "OVERDUE" | "CANCELLED" = "DELIVERED";
      if (parsed.dueDate && new Date(parsed.dueDate) < new Date()) {
        status = "OVERDUE";
      }

      // Crea fattura
      await prisma.invoice.create({
        data: {
          userId: user.id,
          type: parsed.type,
          number: parsed.number,
          date: new Date(parsed.date),
          dueDate: parsed.dueDate ? new Date(parsed.dueDate) : new Date(parsed.date),
          netAmount: parsed.netAmount,
          vatRate: parsed.vatRate,
          vatAmount: parsed.vatAmount,
          totalAmount: parsed.totalAmount,
          withholdingTax: parsed.withholdingTax,
          status,
          clientOrVendor: parsed.clientOrVendor,
          clientVatNumber: parsed.clientVatNumber,
          sdiId: parsed.sdiId,
          xmlContent: xmlContent,
          notes: parsed.description,
          importLogId: importLog.id,
        },
      });

      results.push({
        filename: file.name,
        success: true,
        invoiceNumber: parsed.number,
      });
      imported++;
    } catch (err) {
      results.push({
        filename: file.name,
        success: false,
        error: (err as Error).message,
      });
      errors++;
    }
  }

  return NextResponse.json({
    total: files.length,
    imported,
    skipped,
    errors,
    details: results,
  });
}
