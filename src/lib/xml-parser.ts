// Parser per FatturaPA XML (fattura elettronica italiana)
// Estrae i dati essenziali dal formato XML standard SDI

export interface ParsedInvoice {
  number: string;
  date: string;
  type: "EMESSA" | "RICEVUTA";
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  withholdingTax: number | null;
  clientOrVendor: string;
  clientVatNumber: string | null;
  dueDate: string | null;
  sdiId: string | null;
  description: string | null;
}

// Estrae il testo tra due tag XML (semplice, senza librerie esterne)
function getTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// Estrae tutti i match di un tag
function getAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

// Estrae un blocco XML tra tag apertura e chiusura
function getBlock(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

export function parseFatturaPA(xml: string): ParsedInvoice {
  // Validazione base: deve contenere tag FatturaPA
  if (
    !xml.includes("FatturaElettronica") &&
    !xml.includes("FatturaElettronicaSemplificata")
  ) {
    throw new Error("Il file non sembra essere una FatturaPA valida");
  }

  // Dati generali del documento
  const datiGenerali = getBlock(xml, "DatiGeneraliDocumento");
  if (!datiGenerali) {
    throw new Error("Blocco DatiGeneraliDocumento non trovato");
  }

  const tipoDocumento = getTag(datiGenerali, "TipoDocumento"); // TD01, TD02, etc.
  const number = getTag(datiGenerali, "Numero") || "N/D";
  const date = getTag(datiGenerali, "Data") || new Date().toISOString().split("T")[0];
  const importoTotale = getTag(datiGenerali, "ImportoTotaleDocumento");

  // Dati pagamento per scadenza
  const datiPagamento = getBlock(xml, "DatiPagamento");
  const dueDate = datiPagamento ? getTag(datiPagamento, "DataScadenzaPagamento") : null;

  // Ritenuta d'acconto
  const datiRitenuta = getBlock(xml, "DatiRitenuta");
  const withholdingTax = datiRitenuta
    ? parseFloat(getTag(datiRitenuta, "ImportoRitenuta") || "0")
    : null;

  // Dati IVA — dal riepilogo
  const datiRiepilogo = getBlock(xml, "DatiRiepilogo");
  let vatRate = 22;
  let vatAmount = 0;
  let netAmount = 0;

  if (datiRiepilogo) {
    vatRate = parseFloat(getTag(datiRiepilogo, "AliquotaIVA") || "22");
    vatAmount = parseFloat(getTag(datiRiepilogo, "Imposta") || "0");
    netAmount = parseFloat(getTag(datiRiepilogo, "ImponibileImporto") || "0");
  }

  const totalAmount = importoTotale
    ? parseFloat(importoTotale)
    : netAmount + vatAmount;

  // Se non abbiamo l'imponibile, calcoliamolo dal totale
  if (netAmount === 0 && totalAmount > 0) {
    netAmount = totalAmount / (1 + vatRate / 100);
    vatAmount = totalAmount - netAmount;
  }

  // Cedente/Prestatore (chi emette la fattura) e Cessionario/Committente (chi riceve)
  const cedente = getBlock(xml, "CedentePrestatore");
  const cessionario = getBlock(xml, "CessionarioCommittente");

  // Dati anagrafici cedente
  const cedenteAnagrafica = cedente ? getBlock(cedente, "DatiAnagrafici") : null;
  const cedenteDenominazione = cedenteAnagrafica
    ? getTag(cedenteAnagrafica, "Denominazione") ||
      `${getTag(cedenteAnagrafica, "Nome") || ""} ${getTag(cedenteAnagrafica, "Cognome") || ""}`.trim()
    : null;
  const cedentePIVA = cedenteAnagrafica
    ? getTag(cedenteAnagrafica, "IdCodice")
    : null;

  // Dati anagrafici cessionario
  const cessionarioAnagrafica = cessionario
    ? getBlock(cessionario, "DatiAnagrafici")
    : null;
  const cessionarioDenominazione = cessionarioAnagrafica
    ? getTag(cessionarioAnagrafica, "Denominazione") ||
      `${getTag(cessionarioAnagrafica, "Nome") || ""} ${getTag(cessionarioAnagrafica, "Cognome") || ""}`.trim()
    : null;
  const cessionarioPIVA = cessionarioAnagrafica
    ? getTag(cessionarioAnagrafica, "IdCodice")
    : null;

  // Determina tipo: se il cedente sono io → emessa, altrimenti → ricevuta
  // Euristica: usiamo la P.IVA dell'utente (se disponibile) o default a RICEVUTA
  // In assenza di contesto utente, consideriamo TD01 come ricevuta
  const type: "EMESSA" | "RICEVUTA" =
    tipoDocumento === "TD01" ? "RICEVUTA" : "RICEVUTA";

  // Controparte: per fatture ricevute è il cedente, per emesse è il cessionario
  const clientOrVendor =
    type === "RICEVUTA"
      ? cedenteDenominazione || "Fornitore sconosciuto"
      : cessionarioDenominazione || "Cliente sconosciuto";
  const clientVatNumber =
    type === "RICEVUTA" ? cedentePIVA : cessionarioPIVA;

  // SDI ID
  const sdiId = getTag(xml, "ProgressivoInvio") || null;

  // Descrizione dalla prima linea di dettaglio
  const description = getTag(xml, "Descrizione") || null;

  return {
    number,
    date,
    type,
    netAmount: Math.round(netAmount * 100) / 100,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    withholdingTax,
    clientOrVendor,
    clientVatNumber,
    dueDate,
    sdiId,
    description,
  };
}
