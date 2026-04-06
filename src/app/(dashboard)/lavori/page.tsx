"use client";

import { useEffect, useState } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);
}

const statusLabels: Record<string, { label: string; color: string; order: number }> = {
  PROPOSAL: { label: "Preventivo", color: "#5B7F95", order: 0 },
  CONFIRMED: { label: "Confermato", color: "#C4944A", order: 1 },
  IN_PROGRESS: { label: "In corso", color: "#8B6F47", order: 2 },
  COMPLETED: { label: "Completato", color: "#5B8C5A", order: 3 },
  INVOICED: { label: "Fatturato", color: "#5B8C5A", order: 4 },
  PAID: { label: "Pagato", color: "#5B8C5A", order: 5 },
  CANCELLED: { label: "Annullato", color: "#8E8E8E", order: 6 },
};

interface Project {
  id: string;
  name: string;
  client: string;
  totalAmount: number;
  invoicedAmount: number;
  paidAmount: number;
  status: string;
  progress: number;
  probability: number | null;
  startDate: string | null;
  deadline: string | null;
  _count: { transactions: number };
}

export default function LavoriPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
      setStats(data.stats);
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) fetchProjects();
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        client: form.get("client"),
        totalAmount: parseFloat(form.get("totalAmount") as string),
        status: form.get("status") || "PROPOSAL",
        probability: form.get("probability") ? parseInt(form.get("probability") as string) : null,
        deadline: form.get("deadline") || null,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setMessage({ type: "success", text: "Progetto creato" });
      fetchProjects();
    } else {
      const err = await res.json();
      setMessage({ type: "error", text: err.error });
    }
  }

  // Raggruppa per stato
  const grouped = projects.reduce(
    (acc, p) => {
      const key = p.status;
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {} as Record<string, Project[]>
  );

  const orderedStatuses = Object.keys(grouped).sort(
    (a, b) => (statusLabels[a]?.order ?? 99) - (statusLabels[b]?.order ?? 99)
  );

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="font-display text-2xl text-serenita-slate mb-6">Lavori</h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-serenita-slate">Lavori</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 transition-all"
        >
          Nuovo progetto
        </button>
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
            <p className="text-xs text-serenita-muted uppercase">Attivi</p>
            <p className="font-display text-xl text-serenita-slate">{stats.active}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Valore attivo</p>
            <p className="font-display text-xl text-serenita-gold">{fmt(stats.totalValue)}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Pipeline</p>
            <p className="font-display text-xl text-serenita-slate">{stats.pipeline}</p>
          </div>
          <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
            <p className="text-xs text-serenita-muted uppercase">Valore pesato pipeline</p>
            <p className="font-display text-xl text-serenita-slate-light">{fmt(stats.pipelineValue)}</p>
          </div>
        </div>
      )}

      {/* Form nuovo progetto */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <input name="name" placeholder="Nome progetto" required className="input-field" />
            <input name="client" placeholder="Cliente" required className="input-field" />
            <input name="totalAmount" type="number" step="0.01" placeholder="Valore (EUR)" required className="input-field" />
            <select name="status" className="input-field">
              <option value="PROPOSAL">Preventivo</option>
              <option value="CONFIRMED">Confermato</option>
              <option value="IN_PROGRESS">In corso</option>
            </select>
            <input name="probability" type="number" min="0" max="100" placeholder="Probabilità % (per preventivi)" className="input-field" />
            <input name="deadline" type="date" className="input-field" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white">Crea</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-serenita-muted">Annulla</button>
          </div>
        </form>
      )}

      {/* Pipeline per stato */}
      {projects.length === 0 ? (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-8 text-center">
          <p className="text-serenita-muted">Nessun progetto. Crea il tuo primo lavoro!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedStatuses.map((status) => {
            const st = statusLabels[status] || { label: status, color: "#8E8E8E" };
            const items = grouped[status];

            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: st.color }}
                  />
                  <h3 className="text-sm font-medium text-serenita-slate">
                    {st.label} ({items.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-serenita-slate">{p.name}</p>
                          <p className="text-sm text-serenita-muted">
                            {p.client}
                            {p.deadline && ` · Scadenza: ${new Date(p.deadline).toLocaleDateString("it-IT")}`}
                            {p.probability !== null && ` · ${p.probability}% probabilità`}
                          </p>
                          {/* Progress bar */}
                          {p.progress > 0 && (
                            <div className="mt-2 h-1.5 bg-serenita-warm rounded-full">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${p.progress}%`,
                                  backgroundColor: st.color,
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-display text-lg text-serenita-slate">
                            {fmt(p.totalAmount)}
                          </p>
                          <div className="flex gap-1 mt-1 text-xs text-serenita-muted">
                            <span>Fatt: {fmt(p.invoicedAmount)}</span>
                            <span>·</span>
                            <span>Inc: {fmt(p.paidAmount)}</span>
                          </div>
                          {/* Quick status change */}
                          {p.status === "PROPOSAL" && (
                            <button
                              onClick={() => updateStatus(p.id, "CONFIRMED")}
                              className="mt-2 text-xs px-2 py-1 rounded bg-serenita-gold/10 text-serenita-gold hover:bg-serenita-gold/20"
                            >
                              Conferma
                            </button>
                          )}
                          {p.status === "CONFIRMED" && (
                            <button
                              onClick={() => updateStatus(p.id, "IN_PROGRESS")}
                              className="mt-2 text-xs px-2 py-1 rounded bg-serenita-gold/10 text-serenita-gold hover:bg-serenita-gold/20"
                            >
                              Avvia
                            </button>
                          )}
                          {p.status === "IN_PROGRESS" && (
                            <button
                              onClick={() => updateStatus(p.id, "COMPLETED")}
                              className="mt-2 text-xs px-2 py-1 rounded bg-serenita-green/10 text-serenita-green hover:bg-serenita-green/20"
                            >
                              Completato
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
