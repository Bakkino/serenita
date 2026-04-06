"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);
}

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  icon: string | null;
  color: string | null;
  provider: { name: string; slug: string };
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  categoryIcon: string | null;
  accountName: string;
}

export default function ContiPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setTransactions(d.recentTransactions || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleExport() {
    const params = new URLSearchParams();
    if (selectedAccount) params.set("account", selectedAccount);
    window.open(`/api/export/transactions?${params}`, "_blank");
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="font-display text-2xl text-serenita-slate mb-6">Conti</h2>
        <div className="space-y-4">
          <div className="h-64 rounded-2xl bg-white/30 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/30 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-serenita-muted">Nessun dato disponibile.</p>
      </div>
    );
  }

  const accounts: Account[] = data.accounts || [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  // Distribuzione patrimonio
  const distribution = accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({
      name: a.name,
      value: a.balance,
      percentage: totalBalance > 0 ? ((a.balance / totalBalance) * 100).toFixed(1) : "0",
      color: a.color || "#8B6F47",
    }));

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-serenita-slate">Conti</h2>
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/50 border border-serenita-gold/10 text-serenita-slate hover:bg-white/80 transition-all"
        >
          Esporta CSV
        </button>
      </div>

      {/* Patrimonio totale */}
      <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
        <p className="text-xs text-serenita-muted uppercase mb-1">Patrimonio totale</p>
        <p className="font-display text-3xl text-serenita-slate">{fmt(totalBalance)}</p>
      </div>

      {/* Grafico storico saldi */}
      {data.netWorthHistory && data.netWorthHistory.length > 0 && (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
          <h3 className="font-display text-lg text-serenita-slate mb-4">
            Storico patrimonio
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.netWorthHistory}>
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
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8B6F47"
                fill="#8B6F4720"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lista conti */}
      <div>
        <h3 className="font-display text-lg text-serenita-slate mb-3">I tuoi conti</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() =>
                setSelectedAccount(selectedAccount === a.id ? null : a.id)
              }
              className={`bg-white/50 rounded-xl border p-4 text-left transition-all ${
                selectedAccount === a.id
                  ? "border-serenita-gold/30 ring-2 ring-serenita-gold/10"
                  : "border-serenita-gold/5 hover:border-serenita-gold/15"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-serenita-slate text-sm">
                    {a.icon ? `${a.icon} ` : ""}
                    {a.name}
                  </p>
                  <p className="text-xs text-serenita-muted">{a.provider.name}</p>
                </div>
                <p className="font-display text-lg text-serenita-slate">
                  {fmt(a.balance)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Distribuzione */}
      {distribution.length > 1 && (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
          <h3 className="font-display text-lg text-serenita-slate mb-4">
            Distribuzione patrimonio
          </h3>
          <div className="space-y-3">
            {distribution.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-serenita-slate">{d.name}</span>
                  <span className="text-serenita-muted">
                    {fmt(d.value)} ({d.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-serenita-warm rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${d.percentage}%`,
                      backgroundColor: d.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transazioni recenti */}
      <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6">
        <h3 className="font-display text-lg text-serenita-slate mb-4">
          Ultime transazioni
        </h3>
        {transactions.length === 0 ? (
          <p className="text-serenita-muted text-sm">Nessuna transazione.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-serenita-slate truncate">{t.description}</p>
                  <p className="text-xs text-serenita-muted">
                    {new Date(t.date).toLocaleDateString("it-IT")} ·{" "}
                    {t.category} · {t.accountName}
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
  );
}
