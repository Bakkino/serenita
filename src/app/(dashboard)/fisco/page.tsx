"use client";

import { useEffect, useState } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface TaxDeadline {
  id: string;
  type: string;
  description: string;
  dueDate: string;
  amount: number | null;
  estimatedAmount: number | null;
  isPaid: boolean;
  paidDate: string | null;
  f24Code: string | null;
}

interface Debt {
  id: string;
  type: string;
  description: string;
  creditor: string;
  originalAmount: number;
  remainingAmount: number;
  status: string;
  installments: Array<{
    id: string;
    number: number;
    amount: number;
    dueDate: string;
    isPaid: boolean;
  }>;
}

export default function FiscoPage() {
  const [deadlines, setDeadlines] = useState<TaxDeadline[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [debtStats, setDebtStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"scadenze" | "debiti">("scadenze");

  useEffect(() => {
    Promise.all([fetchDeadlines(), fetchDebts()]).finally(() =>
      setLoading(false)
    );
  }, []);

  async function fetchDeadlines() {
    const res = await fetch(`/api/tax?year=${new Date().getFullYear()}&generate=true`);
    if (res.ok) {
      const data = await res.json();
      setDeadlines(data.deadlines);
      setStats(data.stats);
    }
  }

  async function fetchDebts() {
    const res = await fetch("/api/debts");
    if (res.ok) {
      const data = await res.json();
      setDebts(data.debts);
      setDebtStats(data.stats);
    }
  }

  async function markDeadlinePaid(id: string) {
    const res = await fetch("/api/tax", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isPaid: true }),
    });
    if (res.ok) {
      setMessage({ type: "success", text: "Scadenza segnata come pagata" });
      fetchDeadlines();
    }
  }

  async function markInstallmentPaid(installmentId: string) {
    const res = await fetch("/api/debts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installmentId, isPaid: true }),
    });
    if (res.ok) {
      setMessage({ type: "success", text: "Rata segnata come pagata" });
      fetchDebts();
    }
  }

  async function handleCreateDeadline(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        description: form.get("description"),
        dueDate: form.get("dueDate"),
        amount: form.get("amount") ? parseFloat(form.get("amount") as string) : null,
        estimatedAmount: form.get("estimatedAmount")
          ? parseFloat(form.get("estimatedAmount") as string)
          : null,
      }),
    });
    if (res.ok) {
      setShowDeadlineForm(false);
      setMessage({ type: "success", text: "Scadenza creata" });
      fetchDeadlines();
    }
  }

  async function handleCreateDebt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        description: form.get("description"),
        creditor: form.get("creditor"),
        originalAmount: parseFloat(form.get("originalAmount") as string),
        startDate: form.get("startDate"),
        numberOfInstallments: form.get("numberOfInstallments")
          ? parseInt(form.get("numberOfInstallments") as string)
          : undefined,
      }),
    });
    if (res.ok) {
      setShowDebtForm(false);
      setMessage({ type: "success", text: "Debito creato con piano rate" });
      fetchDebts();
    }
  }

  const now = new Date();

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="font-display text-2xl text-serenita-slate mb-6">Fisco</h2>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl text-serenita-slate">Fisco</h2>
        <div className="flex gap-2">
          {tab === "scadenze" ? (
            <button
              onClick={() => setShowDeadlineForm(!showDeadlineForm)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 transition-all"
            >
              Nuova scadenza
            </button>
          ) : (
            <button
              onClick={() => setShowDebtForm(!showDebtForm)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 transition-all"
            >
              Nuovo debito
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-serenita-green/10 text-serenita-green"
              : "bg-serenita-red/10 text-serenita-red"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* KPI */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Da pagare</p>
            <p className="font-display text-xl text-serenita-slate">{fmt(stats.totalDue)}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Scadute</p>
            <p className="font-display text-xl text-serenita-red">{stats.overdue}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Prossimi 30gg</p>
            <p className="font-display text-xl text-[#C4944A]">{stats.upcoming}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Debito residuo</p>
            <p className="font-display text-xl text-serenita-slate">
              {fmt(debtStats?.totalRemaining || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("scadenze")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "scadenze"
              ? "bg-serenita-slate text-white"
              : "bg-white/50 text-serenita-muted hover:bg-white/80"
          }`}
        >
          Scadenze fiscali
        </button>
        <button
          onClick={() => setTab("debiti")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "debiti"
              ? "bg-serenita-slate text-white"
              : "bg-white/50 text-serenita-muted hover:bg-white/80"
          }`}
        >
          Debiti e rateizzazioni
        </button>
      </div>

      {/* Form nuova scadenza */}
      {showDeadlineForm && tab === "scadenze" && (
        <form
          onSubmit={handleCreateDeadline}
          className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <select name="type" required className="input-field">
              <option value="IVA">IVA</option>
              <option value="IRPEF">IRPEF</option>
              <option value="INPS">INPS</option>
              <option value="F24">F24</option>
              <option value="ALTRO">Altro</option>
            </select>
            <input name="description" placeholder="Descrizione" required className="input-field" />
            <input name="dueDate" type="date" required className="input-field" />
            <input name="amount" type="number" step="0.01" placeholder="Importo esatto (EUR)" className="input-field" />
            <input name="estimatedAmount" type="number" step="0.01" placeholder="Importo stimato (EUR)" className="input-field" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white">Crea</button>
            <button type="button" onClick={() => setShowDeadlineForm(false)} className="px-4 py-2 rounded-lg text-sm text-serenita-muted">Annulla</button>
          </div>
        </form>
      )}

      {/* Form nuovo debito */}
      {showDebtForm && tab === "debiti" && (
        <form
          onSubmit={handleCreateDebt}
          className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <select name="type" required className="input-field">
              <option value="RATEIZZAZIONE">Rateizzazione</option>
              <option value="CARTELLA">Cartella esattoriale</option>
              <option value="AVVISO_BONARIO">Avviso bonario</option>
              <option value="MUTUO">Mutuo</option>
              <option value="PRESTITO">Prestito</option>
              <option value="ALTRO">Altro</option>
            </select>
            <input name="description" placeholder="Descrizione" required className="input-field" />
            <input name="creditor" placeholder="Creditore" required className="input-field" />
            <input name="originalAmount" type="number" step="0.01" placeholder="Importo totale" required className="input-field" />
            <input name="startDate" type="date" required className="input-field" />
            <input name="numberOfInstallments" type="number" placeholder="Numero rate" className="input-field" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white">Crea</button>
            <button type="button" onClick={() => setShowDebtForm(false)} className="px-4 py-2 rounded-lg text-sm text-serenita-muted">Annulla</button>
          </div>
        </form>
      )}

      {/* Lista scadenze */}
      {tab === "scadenze" && (
        <div className="space-y-2">
          {deadlines.length === 0 ? (
            <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-8 text-center">
              <p className="text-serenita-muted">Nessuna scadenza per quest&apos;anno.</p>
            </div>
          ) : (
            deadlines.map((d) => {
              const isOverdue = !d.isPaid && new Date(d.dueDate) < now;
              const isUpcoming =
                !d.isPaid &&
                new Date(d.dueDate) >= now &&
                new Date(d.dueDate) <= new Date(now.getTime() + 30 * 86400000);

              return (
                <div
                  key={d.id}
                  className={`bg-white/50 rounded-xl border p-4 flex items-center justify-between gap-4 ${
                    d.isPaid
                      ? "border-serenita-green/10 opacity-60"
                      : isOverdue
                        ? "border-serenita-red/20"
                        : isUpcoming
                          ? "border-[#C4944A]/20"
                          : "border-serenita-gold/5"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          color: d.isPaid ? "#5B8C5A" : isOverdue ? "#B85C5C" : "#2C3E50",
                          backgroundColor: d.isPaid
                            ? "#5B8C5A15"
                            : isOverdue
                              ? "#B85C5C15"
                              : "#2C3E5010",
                        }}
                      >
                        {d.type}
                      </span>
                      <span className="text-sm text-serenita-slate font-medium">
                        {d.description}
                      </span>
                    </div>
                    <p className="text-xs text-serenita-muted">
                      {fmtDate(d.dueDate)}
                      {d.isPaid && d.paidDate && ` · Pagata il ${fmtDate(d.paidDate)}`}
                      {d.f24Code && ` · Codice ${d.f24Code}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-medium text-serenita-slate">
                        {d.amount ? fmt(d.amount) : d.estimatedAmount ? `~${fmt(d.estimatedAmount)}` : "—"}
                      </p>
                    </div>
                    {!d.isPaid && (
                      <button
                        onClick={() => markDeadlinePaid(d.id)}
                        className="text-xs px-2 py-1 rounded-lg bg-serenita-green/10 text-serenita-green hover:bg-serenita-green/20 transition-all whitespace-nowrap"
                      >
                        Pagata
                      </button>
                    )}
                    {d.isPaid && (
                      <span className="text-serenita-green text-sm">✓</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Lista debiti */}
      {tab === "debiti" && (
        <div className="space-y-4">
          {debts.length === 0 ? (
            <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-8 text-center">
              <p className="text-serenita-muted">Nessun debito o rateizzazione.</p>
            </div>
          ) : (
            debts.map((debt) => {
              const paidCount = debt.installments.filter((i) => i.isPaid).length;
              const progress =
                debt.installments.length > 0
                  ? (paidCount / debt.installments.length) * 100
                  : ((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100;

              return (
                <div
                  key={debt.id}
                  className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-serenita-slate">
                        {debt.description}
                      </p>
                      <p className="text-xs text-serenita-muted">
                        {debt.creditor} · {debt.type.replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg text-serenita-slate">
                        {fmt(debt.remainingAmount)}
                      </p>
                      <p className="text-xs text-serenita-muted">
                        di {fmt(debt.originalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Barra progresso */}
                  <div className="h-2 bg-serenita-warm rounded-full mb-3">
                    <div
                      className="h-full bg-serenita-green rounded-full transition-all"
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>

                  {/* Rate */}
                  {debt.installments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {debt.installments.map((inst) => {
                        const isOverdue = !inst.isPaid && new Date(inst.dueDate) < now;
                        return (
                          <button
                            key={inst.id}
                            onClick={() => !inst.isPaid && markInstallmentPaid(inst.id)}
                            disabled={inst.isPaid}
                            className={`p-2 rounded-lg text-xs text-center transition-all ${
                              inst.isPaid
                                ? "bg-serenita-green/10 text-serenita-green"
                                : isOverdue
                                  ? "bg-serenita-red/10 text-serenita-red hover:bg-serenita-red/20"
                                  : "bg-white/50 text-serenita-slate hover:bg-white/80"
                            }`}
                          >
                            <p className="font-medium">Rata {inst.number}</p>
                            <p>{fmt(inst.amount)}</p>
                            <p className="opacity-60">
                              {new Date(inst.dueDate).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Info accantonamento */}
      <div className="bg-white/30 rounded-xl p-4 text-xs text-serenita-muted">
        <strong>Consiglio:</strong> accantona almeno il 35% delle tue entrate mensili per coprire
        IVA, IRPEF e INPS. Per un artigiano in regime ordinario: IVA ~22% entrate,
        IRPEF ~25-30% reddito, INPS ~26% reddito netto.
      </div>
    </div>
  );
}
