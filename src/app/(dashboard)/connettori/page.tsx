"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

interface Connection {
  id: string;
  bankName: string;
  ibanMasked: string | null;
  balance: number | null;
  currency: string;
  accountName: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  validUntil: string | null;
  daysUntilExpiry: number;
  isActive: boolean;
  status: "connected" | "expiring" | "expired" | "error";
  syncCount: number;
}

interface StatusData {
  connections: Connection[];
  totalAccounts: number;
  activeAccounts: number;
  hasExpiring: boolean;
  hasErrors: boolean;
}

const statusConfig = {
  connected: { label: "Connesso", color: "#5B8C5A", dot: "bg-green-500" },
  expiring: { label: "In scadenza", color: "#C4944A", dot: "bg-amber-500" },
  expired: { label: "Scaduto", color: "#B85C5C", dot: "bg-red-500" },
  error: { label: "Errore", color: "#B85C5C", dot: "bg-red-500" },
};

export default function ConnettoriPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-40 bg-white/30 rounded-2xl" />}>
      <ConnettoriContent />
    </Suspense>
  );
}

function ConnettoriContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Messaggi dal callback
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success) setMessage({ type: "success", text: success });
    if (error) setMessage({ type: "error", text: error });
  }, [searchParams]);

  // Carica stato connessioni
  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/banking/status");
      if (res.ok) setData(await res.json());
    } catch {
      // Silenzioso — mostrerà stato vuoto
    } finally {
      setLoading(false);
    }
  }

  // Collega nuova banca
  async function handleConnect() {
    setConnecting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/banking/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspsp_name: "Intesa Sanpaolo", country: "IT" }),
      });

      if (!res.ok) throw new Error("Errore nell'avvio del collegamento");

      const { url } = await res.json();
      // Redirige alla banca per l'autorizzazione
      window.location.href = url;
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message || "Errore nel collegamento",
      });
      setConnecting(false);
    }
  }

  // Sync manuale
  async function handleSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/banking/sync", { method: "POST" });
      const result = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: `Sincronizzazione completata: ${result.transactionsImported} nuove transazioni importate.`,
        });
        fetchStatus(); // Ricarica
      } else {
        throw new Error(result.error || "Errore nella sincronizzazione");
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message || "Errore nella sincronizzazione",
      });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="font-display text-2xl text-serenita-slate mb-6">
          Connettori
        </h2>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-white/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const hasConnections = data && data.connections.length > 0;

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-serenita-slate">
          Connettori
        </h2>
        <div className="flex gap-2">
          {hasConnections && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/50 border border-serenita-gold/10 text-serenita-slate hover:bg-white/80 disabled:opacity-50 transition-all"
            >
              {syncing ? "Sincronizzazione..." : "Sync ora"}
            </button>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 disabled:opacity-50 transition-all"
          >
            {connecting ? "Collegamento..." : "Collega banca"}
          </button>
        </div>
      </div>

      {/* Messaggio feedback */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-serenita-green/10 border border-serenita-green/20 text-serenita-green"
              : "bg-serenita-red/10 border border-serenita-red/20 text-serenita-red"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Stato vuoto */}
      {!hasConnections && (
        <div className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-12 text-center">
          <div className="text-4xl mb-4">🏦</div>
          <h3 className="font-display text-xl text-serenita-slate mb-2">
            Collega la tua prima banca
          </h3>
          <p className="text-serenita-muted text-sm max-w-md mx-auto mb-6">
            Connetti i tuoi conti bancari per vedere saldi e transazioni in
            tempo reale. Usiamo Open Banking (PSD2) — i tuoi dati restano
            tuoi.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-6 py-3 rounded-lg font-medium bg-serenita-slate text-white hover:bg-serenita-slate/90 disabled:opacity-50 transition-all"
          >
            {connecting ? "Collegamento in corso..." : "Collega Intesa Sanpaolo"}
          </button>
        </div>
      )}

      {/* Lista connessioni */}
      {hasConnections && (
        <div className="space-y-3">
          {data!.connections.map((conn) => {
            const cfg = statusConfig[conn.status];

            return (
              <div
                key={conn.id}
                className="bg-white/50 rounded-2xl border border-serenita-gold/5 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Indicatore stato */}
                      <span
                        className={`w-2 h-2 rounded-full ${cfg.dot}`}
                      />
                      <span className="font-medium text-serenita-slate">
                        {conn.bankName}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          color: cfg.color,
                          backgroundColor: `${cfg.color}15`,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-serenita-muted">
                      {conn.accountName && <span>{conn.accountName}</span>}
                      {conn.ibanMasked && <span>IBAN {conn.ibanMasked}</span>}
                    </div>

                    {/* Errore */}
                    {conn.lastSyncError && (
                      <p className="text-xs text-serenita-red mt-1">
                        Errore: {conn.lastSyncError}
                      </p>
                    )}

                    {/* Info sync */}
                    <div className="flex items-center gap-4 text-xs text-serenita-muted mt-2">
                      {conn.lastSyncAt && (
                        <span>
                          Ultima sync:{" "}
                          {new Date(conn.lastSyncAt).toLocaleString("it-IT")}
                        </span>
                      )}
                      {conn.status === "expiring" && (
                        <span className="text-amber-600">
                          Scade tra {conn.daysUntilExpiry} giorni — ri-autorizza
                        </span>
                      )}
                      {conn.status === "expired" && (
                        <span className="text-serenita-red">
                          Autorizzazione scaduta — collega di nuovo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saldo */}
                  <div className="text-right ml-4">
                    {conn.balance !== null ? (
                      <p className="font-display text-xl text-serenita-slate">
                        {fmt(conn.balance)}
                      </p>
                    ) : (
                      <p className="text-serenita-muted text-sm">
                        Saldo non disponibile
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info PSD2 */}
      <div className="bg-white/30 rounded-xl p-4 text-xs text-serenita-muted">
        <p>
          <strong>Open Banking PSD2:</strong> la connessione usa standard
          europei sicuri. L&apos;autorizzazione scade ogni 90 giorni e dovrai
          ri-autorizzare dalla tua app bancaria. Max 4 sincronizzazioni al
          giorno per conto.
        </p>
      </div>
    </div>
  );
}
