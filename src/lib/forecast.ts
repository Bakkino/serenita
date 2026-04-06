// Previsione cash flow 3-6 mesi
// Basata su: entrate ricorrenti, uscite ricorrenti, scadenze fiscali, progetti pipeline

export interface ForecastMonth {
  month: string; // "2026-07"
  label: string; // "Luglio"
  projectedIncome: number;
  projectedExpenses: number;
  taxDeadlines: number;
  projectIncome: number;
  netCashFlow: number;
  projectedBalance: number;
}

interface ForecastInput {
  currentBalance: number;
  // Media ultimi 3 mesi
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  // Scadenze fiscali future (per mese)
  taxByMonth: Record<string, number>;
  // Progetti in pipeline (importo * probabilità, per mese previsto)
  projectsByMonth: Record<string, number>;
}

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function generateForecast(input: ForecastInput, months: number = 6): ForecastMonth[] {
  const forecast: ForecastMonth[] = [];
  let runningBalance = input.currentBalance;

  const now = new Date();

  for (let i = 1; i <= months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const projectedIncome = input.avgMonthlyIncome;
    const projectedExpenses = input.avgMonthlyExpenses;
    const taxDeadlines = input.taxByMonth[key] || 0;
    const projectIncome = input.projectsByMonth[key] || 0;

    const netCashFlow = projectedIncome + projectIncome - projectedExpenses - taxDeadlines;
    runningBalance += netCashFlow;

    forecast.push({
      month: key,
      label: MONTH_NAMES[date.getMonth()],
      projectedIncome,
      projectedExpenses,
      taxDeadlines,
      projectIncome,
      netCashFlow,
      projectedBalance: Math.round(runningBalance),
    });
  }

  return forecast;
}
