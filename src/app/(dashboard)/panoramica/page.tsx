"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function healthLabel(score: number) {
  if (score >= 70) return { text: "Buona", color: "#5B8C5A" };
  if (score >= 45) return { text: "Attenzione", color: "#C4944A" };
  return { text: "Critica", color: "#B85C5C" };
}

interface OverviewData {
  totalBalance: number;
  cashFlow: number;
  monthIncome: number;
  monthExpense: number;
  unpaidTotal: number;
  overdueCount: number;
  overdueTotal: number;
  nextTaxAmount: number;
  totalDebtRemaining: number;
  healthScore: number;
  runway: number;
  accounts: any[];
  cashFlowHistory: any[];
  upcomingDeadlines: any[];
  recentTransactions: any[];
  activeDebts: any[];
}

export default function PanoramicaPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="font-display text-2xl text-serenita-slate mb-6">
          Panoramica
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-white/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-serenita-muted">
          Nessun dato disponibile. Collega la tua prima banca dalla sezione
          Connettori.
        </p>
      </div>
    );
  }

  const health = healthLabel(data.healthScore);

  return (
    <div className="animate-fade-in-up space-y-6">
      <h2 className="font-display text-2xl text-serenita-slate">Panoramica</h2>

      {/* Alert: fatture scadute */}
      {data.overdueCount > 0 && (
        <div className="p-4 rounded-xl bg-serenita-red/10 border border-serenita-red/20 text-sm text-serenita-red">
          {data.overdueCount} fattur{data.overdueCount === 1 ? "a" : "e"}{" "}
          scadut{data.overdueCount === 1 ? "a" : "e"} per {fmt(data.overdueTotal)}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          label="Patrimonio netto"
          value={fmt(data.totalBalance)}
          sub={`Runway: ${data.runway} mesi`}
        />
        <Card
          label="Cash flow mese"
          value={fmt(data.cashFlow)}
          sub={`+${fmt(data.monthIncome)} / -${fmt(data.monthExpense)}`}
          color={data.cashFlow >= 0 ? "#5B8C5A" : "#B85C5C"}
        />
        <Card
          label="Da incassare"
          value={fmt(data.unpaidTotal)}
          sub={`${data.overdueCount} scadute`}
        />
        <Card
          label="Health Score"
          value={`${data.healthScore}/100`}
          sub={health.text}
          color={health.color}
        />
      </div>

      {/* Grafico cash flow 6 mesi */}
      {data.cashFlowHistory.length > 0 && (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
          <h3 className="font-display text-lg text-serenita-slate mb-4">
            Cash flow ultimi 6 mesi
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.cashFlowHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE8E0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v: number) => fmt(v)}
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Legend />
              <Bar
                dataKey="entrate"
                name="Entrate"
                fill="#5B8C5A"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="uscite"
                name="Uscite"
                fill="#B85C5C"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Prossime scadenze + Ultime transazioni */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scadenze */}
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
          <h3 className="font-display text-lg text-serenita-slate mb-4">
            Prossime scadenze
          </h3>
          {data.upcomingDeadlines.length === 0 ? (
            <p className="text-serenita-muted text-sm">
              Nessuna scadenza imminente
            </p>
          ) : (
            <div className="space-y-3">
              {data.upcomingDeadlines.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="text-serenita-slate font-medium">
                      {d.description}
                    </span>
                    <span className="text-serenita-muted ml-2">
                      {new Date(d.dueDate).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  <span className="text-serenita-slate font-medium">
                    {d.amount ? fmt(d.amount) : "—"}
                    {d.isEstimate && (
                      <span className="text-serenita-muted text-xs ml-1">
                        ~
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transazioni recenti */}
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
          <h3 className="font-display text-lg text-serenita-slate mb-4">
            Ultime transazioni
          </h3>
          {data.recentTransactions.length === 0 ? (
            <p className="text-serenita-muted text-sm">
              Nessuna transazione
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentTransactions.slice(0, 6).map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-serenita-slate truncate">
                      {t.description}
                    </p>
                    <p className="text-serenita-muted text-xs">
                      {new Date(t.date).toLocaleDateString("it-IT")} ·{" "}
                      {t.category}
                    </p>
                  </div>
                  <span
                    className={`font-medium ml-4 whitespace-nowrap ${
                      t.amount >= 0 ? "text-serenita-green" : "text-serenita-red"
                    }`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {fmt(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-5">
      <p className="text-serenita-muted text-xs uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className="font-display text-2xl"
        style={{ color: color || "#2C3E50" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-serenita-muted text-xs mt-1">{sub}</p>
      )}
    </div>
  );
}
