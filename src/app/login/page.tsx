"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email o password non validi");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-serenita-slate mb-2">
            Serenità
          </h1>
          <p className="text-serenita-muted text-sm">
            La tua pace finanziaria
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/50 backdrop-blur-sm rounded-2xl p-8 border border-serenita-gold/5 shadow-sm"
        >
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-serenita-red/10 text-serenita-red text-sm text-center">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-serenita-slate mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg border border-serenita-gold/10 bg-white/80 text-serenita-slate placeholder:text-serenita-muted/50 focus:outline-none focus:ring-2 focus:ring-serenita-gold/20 focus:border-serenita-gold/30 transition-all"
              placeholder="paolo@email.com"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-serenita-slate mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-lg border border-serenita-gold/10 bg-white/80 text-serenita-slate placeholder:text-serenita-muted/50 focus:outline-none focus:ring-2 focus:ring-serenita-gold/20 focus:border-serenita-gold/30 transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-serenita-slate text-white font-medium hover:bg-serenita-slate/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>

        <p className="text-center text-xs text-serenita-muted mt-6">
          I tuoi dati finanziari sono protetti e cifrati.
        </p>
      </div>
    </div>
  );
}
