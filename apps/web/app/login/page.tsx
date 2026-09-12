"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { register, login, loginWithGoogle } from "../../lib/auth";
import { recordReferralEvent } from "../../lib/api";

declare global { interface Window { google?: any; } }

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
          try { await loginWithGoogle(resp.credential); router.push("/"); }
          catch (e) { setErr((e as Error).message); }
        },
      });
      window.google?.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "filled_black", size: "large", width: 300, text: mode === "register" ? "signup_with" : "signin_with" });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [googleClientId, mode, router]);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      if (mode === "register") {
        const r = await register(email, password, name || undefined);
        const ref = localStorage.getItem("gb:ref");
        if (ref) { await recordReferralEvent(ref, r.user.id, "install"); localStorage.removeItem("gb:ref"); }
      } else {
        await login(email, password);
      }
      router.push("/");
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
          {(["login","register"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2 font-mono text-xs uppercase transition ${mode === m ? "bg-cyan/15 text-cyan" : "text-ink-muted"}`}>
              {m === "login" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        {mode === "register" && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)"
            className="mb-3 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" autoComplete="email"
          className="mb-3 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="Senha (mín. 8)" autoComplete={mode === "register" ? "new-password" : "current-password"}
          className="mb-4 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />

        {err && <p className="mb-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-xs text-crit">{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full rounded-lg bg-cyan py-3 font-display text-sm font-semibold text-bg-900 shadow-neon-cyan transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : mode === "login" ? "Entrar" : "Criar conta"}
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
