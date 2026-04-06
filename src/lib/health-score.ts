// Health Score — Algoritmo (0-100)
// Indicatore complessivo della salute finanziaria

interface HealthScoreInput {
  totalBalance: number;
  previousMonthBalance: number;
  runway: number; // mesi
  overdueInvoices: number;
  overdueOverSixtyDays: number;
  cashFlow: number;
  unpaidDeadlinesWithin7Days: number;
  unpaidDeadlinesWithin30Days: number;
  overdueInstallments: number;
  accountCount: number;
}

export interface HealthScoreResult {
  score: number;
  label: "Buona" | "Attenzione" | "Critica";
  color: string;
  breakdown: Array<{ factor: string; points: number; reason: string }>;
}

export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const breakdown: Array<{ factor: string; points: number; reason: string }> = [];
  let score = 50;

  // Runway
  if (input.runway < 3) {
    breakdown.push({ factor: "Runway", points: 0, reason: "Meno di 3 mesi di autonomia" });
  } else if (input.runway < 6) {
    score += 5;
    breakdown.push({ factor: "Runway", points: 5, reason: "3-6 mesi di autonomia" });
  } else if (input.runway < 12) {
    score += 10;
    breakdown.push({ factor: "Runway", points: 10, reason: "6-12 mesi di autonomia" });
  } else if (input.runway < 24) {
    score += 15;
    breakdown.push({ factor: "Runway", points: 15, reason: "12-24 mesi di autonomia" });
  } else {
    score += 20;
    breakdown.push({ factor: "Runway", points: 20, reason: "Oltre 24 mesi di autonomia" });
  }

  // Fatture scadute
  if (input.overdueOverSixtyDays > 0) {
    score -= 20;
    breakdown.push({ factor: "Fatture >60gg", points: -20, reason: `${input.overdueOverSixtyDays} fatture scadute da oltre 60 giorni` });
  } else if (input.overdueInvoices >= 3) {
    score -= 15;
    breakdown.push({ factor: "Fatture scadute", points: -15, reason: `${input.overdueInvoices} fatture scadute` });
  } else if (input.overdueInvoices === 2) {
    score -= 10;
    breakdown.push({ factor: "Fatture scadute", points: -10, reason: "2 fatture scadute" });
  } else if (input.overdueInvoices === 1) {
    score -= 5;
    breakdown.push({ factor: "Fatture scadute", points: -5, reason: "1 fattura scaduta" });
  }

  // Cash flow
  if (input.cashFlow < 0) {
    score -= 5;
    breakdown.push({ factor: "Cash flow", points: -5, reason: "Cash flow negativo questo mese" });
  } else if (input.cashFlow >= 1000 && input.cashFlow < 3000) {
    score += 5;
    breakdown.push({ factor: "Cash flow", points: 5, reason: "Cash flow positivo (1-3k)" });
  } else if (input.cashFlow >= 3000 && input.cashFlow < 5000) {
    score += 10;
    breakdown.push({ factor: "Cash flow", points: 10, reason: "Cash flow buono (3-5k)" });
  } else if (input.cashFlow >= 5000) {
    score += 15;
    breakdown.push({ factor: "Cash flow", points: 15, reason: "Cash flow ottimo (>5k)" });
  }

  // Scadenze imminenti
  if (input.unpaidDeadlinesWithin7Days > 0) {
    score -= 10;
    breakdown.push({ factor: "Scadenze 7gg", points: -10, reason: `${input.unpaidDeadlinesWithin7Days} scadenze entro 7 giorni` });
  } else if (input.unpaidDeadlinesWithin30Days > 0) {
    score -= 5;
    breakdown.push({ factor: "Scadenze 30gg", points: -5, reason: `${input.unpaidDeadlinesWithin30Days} scadenze entro 30 giorni` });
  }

  // Rate scadute non pagate
  if (input.overdueInstallments > 0) {
    const penalty = input.overdueInstallments * -5;
    score += penalty;
    breakdown.push({ factor: "Rate scadute", points: penalty, reason: `${input.overdueInstallments} rate non pagate` });
  }

  // Diversificazione conti
  if (input.accountCount >= 4) {
    score += 5;
    breakdown.push({ factor: "Diversificazione", points: 5, reason: `${input.accountCount} conti attivi` });
  } else if (input.accountCount >= 2) {
    score += 3;
    breakdown.push({ factor: "Diversificazione", points: 3, reason: `${input.accountCount} conti attivi` });
  }

  // Trend patrimonio
  if (input.previousMonthBalance > 0 && input.totalBalance > input.previousMonthBalance) {
    score += 5;
    breakdown.push({ factor: "Trend", points: 5, reason: "Patrimonio in crescita" });
  }

  // Clamp [0, 100]
  score = Math.max(0, Math.min(100, score));

  let label: "Buona" | "Attenzione" | "Critica";
  let color: string;
  if (score >= 70) {
    label = "Buona";
    color = "#5B8C5A";
  } else if (score >= 45) {
    label = "Attenzione";
    color = "#C4944A";
  } else {
    label = "Critica";
    color = "#B85C5C";
  }

  return { score, label, color, breakdown };
}
