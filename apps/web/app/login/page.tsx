"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, loginWithGoogle } from "../../lib/auth";

declare global { interface Window { google?: any; } }

// Criar conta vive só em /signup (dali sai a tela de escolha de plano) —
// /login não tem mais um formulário de cadastro próprio. Duas telas de
// registro divergentes deixavam gente criar conta e cair em FREE sem
// nunca ver os planos.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Google Identity Services (opcional; requer NEXT_PUBLIC_GOOGLE_CLIENT_ID).
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!googleClientId) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp: { credential: string }) => {
          try { await loginWithGoogle(resp.credential); router.push("/app"); }
          catch (e) { setErr((e as Error).message); }
        },
      });
      window.google?.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "filled_black", size: "large", width: 300, text: "signin_with" });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [googleClientId, router]);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      await login(email, password);
      router.push("/app");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">GenBreed<span className="text-cyan">AI</span></h1>
        <p className="mt-1 font-mono text-[0.72rem] text-ink-muted">// genética real, criaturas geradas por IA</p>
      </div>

      <div className="rounded-card border border-white/10 bg-bg-800/70 p-6">
        <div className="mb-5 flex gap-1 rounded-lg bg-bg-900 p-1">
          <div className="flex-1 rounded-md bg-cyan/15 py-2 text-center font-mono text-xs uppercase text-cyan">Entrar</div>
          <Link href="/signup" className="flex-1 rounded-md py-2 text-center font-mono text-xs uppercase text-ink-muted transition hover:text-ink">Criar conta</Link>
        </div>

        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" autoComplete="email"
          className="mb-3 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="Senha" autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />

        {err && <p className="mb-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-xs text-crit">{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full rounded-lg bg-cyan py-3 font-display text-sm font-semibold text-bg-900 shadow-neon-cyan transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Entrar"}
        </button>

        {googleClientId ? (
          <div className="mt-4 flex justify-center"><div id="gbtn" /></div>
        ) : (
          <p className="mt-4 text-center font-mono text-[0.6rem] text-ink-muted">Login Google: defina NEXT_PUBLIC_GOOGLE_CLIENT_ID</p>
        )}
      </div>
    </main>
  );
}
