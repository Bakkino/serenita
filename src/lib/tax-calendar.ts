// Generatore scadenze fiscali per artigiano regime ordinario
// Genera le scadenze standard per un anno fiscale

export interface TaxDeadlineTemplate {
  type: "IVA" | "IRPEF" | "INPS" | "ALTRO";
  description: string;
  month: number; // 1-12
  day: number;
  recurringRule: string;
  f24Code: string | null;
  estimateFunction?: "iva_mensile" | "irpef_acconto" | "inps_acconto";
}

// Scadenze standard artigiano regime ordinario
const DEADLINES: TaxDeadlineTemplate[] = [
  // IVA mensile — il 16 del mese successivo
  ...Array.from({ length: 12 }, (_, i) => ({
    type: "IVA" as const,
    description: `IVA liquidazione mensile ${getMonthName(i)}`,
    month: i === 11 ? 1 : i + 2, // Gennaio si paga a febbraio, etc.
    day: 16,
    recurringRule: "monthly_16",
    f24Code: "6001",
    estimateFunction: "iva_mensile" as const,
  })),

  // IRPEF saldo + 1° acconto — 30 giugno
  {
    type: "IRPEF",
    description: "IRPEF saldo anno precedente + 1° acconto",
    month: 6,
    day: 30,
    recurringRule: "yearly_jun",
    f24Code: "4001",
    estimateFunction: "irpef_acconto",
  },

  // IRPEF 2° acconto — 30 novembre
  {
    type: "IRPEF",
    description: "IRPEF 2° acconto",
    month: 11,
    day: 30,
    recurringRule: "yearly_nov",
    f24Code: "4034",
    estimateFunction: "irpef_acconto",
  },

  // INPS Gestione Separata saldo + 1° acconto — 30 giugno
  {
    type: "INPS",
    description: "INPS Gestione Separata saldo + 1° acconto",
    month: 6,
    day: 30,
    recurringRule: "yearly_jun",
    f24Code: "PXX",
  },

  // INPS 2° acconto — 30 novembre
  {
    type: "INPS",
    description: "INPS Gestione Separata 2° acconto",
    month: 11,
    day: 30,
    recurringRule: "yearly_nov",
    f24Code: "PXX",
  },

  // Diritto camerale — 30 giugno
  {
    type: "ALTRO",
    description: "Diritto annuale Camera di Commercio",
    month: 6,
    day: 30,
    recurringRule: "yearly_jun",
    f24Code: "3850",
  },
];

function getMonthName(index: number): string {
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
  ];
  return months[index];
}

// Genera le scadenze per un anno specifico
export function generateDeadlinesForYear(year: number): Array<{
  type: "IVA" | "IRPEF" | "INPS" | "ALTRO";
  description: string;
  dueDate: Date;
  recurringRule: string;
  f24Code: string | null;
  estimateFunction?: string;
}> {
  return DEADLINES.map((d) => {
    // L'IVA di dicembre dell'anno precedente va a gennaio dell'anno corrente
    const deadlineYear = d.type === "IVA" && d.month === 1 ? year : year;

    return {
      type: d.type,
      description: d.description,
      dueDate: new Date(deadlineYear, d.month - 1, d.day),
      recurringRule: d.recurringRule,
      f24Code: d.f24Code,
      estimateFunction: d.estimateFunction,
    };
  });
}

// Stima IVA mensile: ~22% delle entrate del mese
export function estimateMonthlyVAT(monthlyIncome: number): number {
  return Math.round(monthlyIncome * 0.22);
}

// Stima IRPEF: ~27.5% del reddito annuo (media aliquote progressive)
export function estimateIRPEF(annualIncome: number, annualExpenses: number): number {
  const taxableIncome = annualIncome - annualExpenses;
  if (taxableIncome <= 0) return 0;

  // Aliquote IRPEF progressive semplificate
  let tax = 0;
  if (taxableIncome <= 28000) {
    tax = taxableIncome * 0.23;
  } else if (taxableIncome <= 50000) {
    tax = 28000 * 0.23 + (taxableIncome - 28000) * 0.35;
  } else {
    tax = 28000 * 0.23 + 22000 * 0.35 + (taxableIncome - 50000) * 0.43;
  }

  return Math.round(tax);
}

// Stima INPS Gestione Separata: 26.07% del reddito netto
export function estimateINPS(annualIncome: number, annualExpenses: number): number {
  const taxableIncome = annualIncome - annualExpenses;
  if (taxableIncome <= 0) return 0;
  return Math.round(taxableIncome * 0.2607);
}

// Calcola accantonamento consigliato: 35% delle entrate mensili
export function suggestedMonthlyReserve(monthlyIncome: number): number {
  return Math.round(monthlyIncome * 0.35);
}
