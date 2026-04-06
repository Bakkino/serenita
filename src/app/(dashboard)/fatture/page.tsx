"use client";

import { useEffect, useState, useRef } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT");
}

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Bozza", color: "#8E8E8E" },
  SENT: { label: "Inviata", color: "#5B7F95" },
  DELIVERED: { label: "Consegnata", color: "#5B7F95" },
  PAID: { label: "Pagata", color: "#5B8C5A" },
  OVERDUE: { label: "Scaduta", color: "#B85C5C" },
  CANCELLED: { label: "Annullata", color: "#8E8E8E" },
};

interface Invoice {
  id: string;
  type: string;
  number: string;
  date: string;
  dueDate: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  clientOrVendor: string;
  paidDate: string | null;
}

export default function FatturePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "EMESSA" | "RICEVUTA">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInvoices();
  }, [filter, statusFilter]);

  async function fetchInvoices() {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("type", filter);
    if (statusFilter !== "all") params.set("status", statusFilter);

    const res = await fetch(`/api/invoices?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices);
    }
    setLoading(false);
  }

  async function handleImportXML(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setImporting(true);
    setMessage(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/invoices/import", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: `Importate ${result.imported} fatture, ${result.skipped} duplicate, ${result.errors} errori`,
        });
        fetchInvoices();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch {
      setMessage({ type: "error", text: "Errore durante l'importazione" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function markAsPaid(id: string) {
    const res = await fetch("/api/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "PAID" }),
    });

    if (res.ok) {
      setMessage({ type: "success", text: "Fattura segnata come pagata" });
      fetchInvoices();
    }
  }

  async function handleCreateInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const data = {
      type: form.get("type") as string,
      number: form.get("number") as string,
      date: form.get("date") as string,
      dueDate: form.get("dueDate") as string,
      netAmount: parseFloat(form.get("netAmount") as string),
      vatRate: parseFloat(form.get("vatRate") as string) || 22,
      clientOrVendor: form.get("clientOrVendor") as string,
      status: "DRAFT",
    };

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setMessage({ type: "success", text: `Fattura ${data.number} creata` });
      setShowForm(false);
      fetchInvoices();
    } else {
      const err = await res.json();
      setMessage({ type: "error", text: err.error });
    }
  }

  // Statistiche rapide
  const emesse = invoices.filter((i) => i.type === "EMESSA");
  const daIncassare = emesse.filter((i) => ["SENT", "DELIVERED", "OVERDUE"].includes(i.status));
  const totDaIncassare = daIncassare.reduce((s, i) => s + i.totalAmount, 0);
  const scadute = emesse.filter((i) => i.status === "OVERDUE");

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl text-serenita-slate">Fatture</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.p7m"
            multiple
            onChange={handleImportXML}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/50 border border-serenita-gold/10 text-serenita-slate hover:bg-white/80 disabled:opacity-50 transition-all"
          >
            {importing ? "Importo..." : "Importa XML"}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 transition-all"
          >
            Nuova fattura
          </button>
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

      {/* KPI rapidi */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
          <p className="text-xs text-serenita-muted uppercase">Totale fatture</p>
          <p className="font-display text-xl text-serenita-slate">{invoices.length}</p>
        </div>
        <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
          <p className="text-xs text-serenita-muted uppercase">Da incassare</p>
          <p className="font-display text-xl text-serenita-gold">{fmt(totDaIncassare)}</p>
        </div>
        <div className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4">
          <p className="text-xs text-serenita-muted uppercase">Scadute</p>
          <p className="font-display text-xl text-serenita-red">{scadute.length}</p>
        </div>
      </div>

      {/* Form nuova fattura */}
      {showForm && (
        <form
          onSubmit={handleCreateInvoice}
          className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-6 space-y-4"
        >
          <h3 className="font-display text-lg text-serenita-slate">Nuova fattura</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <select name="type" required className="input-field">
              <option value="EMESSA">Emessa</option>
              <option value="RICEVUTA">Ricevuta</option>
            </select>
            <input name="number" placeholder="Numero (es. FE-2026-001)" required className="input-field" />
            <input name="clientOrVendor" placeholder="Cliente / Fornitore" required className="input-field" />
            <input name="date" type="date" required className="input-field" />
            <input name="dueDate" type="date" required className="input-field" />
            <input name="netAmount" type="number" step="0.01" placeholder="Imponibile (EUR)" required className="input-field" />
            <input name="vatRate" type="number" step="0.01" defaultValue="22" placeholder="Aliquota IVA %" className="input-field" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90">
              Crea
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-serenita-muted hover:bg-white/50">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "EMESSA", "RICEVUTA"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? "bg-serenita-slate text-white"
                : "bg-white/50 text-serenita-muted hover:bg-white/80"
            }`}
          >
            {f === "all" ? "Tutte" : f === "EMESSA" ? "Emesse" : "Ricevute"}
          </button>
        ))}
        <span className="w-px bg-serenita-gold/10" />
        {(["all", "DRAFT", "SENT", "PAID", "OVERDUE"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === s
                ? "bg-serenita-slate text-white"
                : "bg-white/50 text-serenita-muted hover:bg-white/80"
            }`}
          >
            {s === "all" ? "Tutti" : statusLabels[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Lista fatture */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/30 animate-pulse" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-8 text-center">
          <p className="text-serenita-muted">Nessuna fattura trovata.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const st = statusLabels[inv.status] || { label: inv.status, color: "#8E8E8E" };
            return (
              <div
                key={inv.id}
                className="bg-white/50 rounded-xl border border-serenita-gold/5 p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-serenita-slate text-sm">
                      {inv.number}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ color: st.color, backgroundColor: `${st.color}15` }}
                    >
                      {st.label}
                    </span>
                    <span className="text-xs text-serenita-muted">
                      {inv.type === "EMESSA" ? "Emessa" : "Ricevuta"}
                    </span>
                  </div>
                  <p className="text-sm text-serenita-muted truncate">
                    {inv.clientOrVendor} · {fmtDate(inv.date)} → {fmtDate(inv.dueDate)}
                  </p>
                </div>
                <div className="text-right flex items-center gap-3">
                  <p className="font-display text-lg text-serenita-slate">
                    {fmt(inv.totalAmount)}
                  </p>
                  {["SENT", "DELIVERED", "OVERDUE"].includes(inv.status) && (
                    <button
                      onClick={() => markAsPaid(inv.id)}
                      className="text-xs px-2 py-1 rounded-lg bg-serenita-green/10 text-serenita-green hover:bg-serenita-green/20 transition-all"
                    >
                      Pagata
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
