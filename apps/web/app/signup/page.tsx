"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { register } from "../../lib/auth";

const PLAN_LABEL: Record<string, string> = { FREE: "Free", JUNIOR: "Junior", SENIOR: "Senior", PHD: "PhD" };

function SignupInner() {
  const router = useRouter();
  const search = useSearchParams();
  const plan = search.get("plan");
  const interval = search.get("interval") === "year" ? "year" : "month";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      await register(email, password, name || undefined);
      // Leva o plano/intervalo escolhido adiante — quem finaliza a assinatura
      // é a tela do jogo, não o cadastro em si.
      const qs = plan ? `?plan=${plan}&interval=${interval}` : "";
      router.push(`/app${qs}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">GenBreed<span className="text-cyan">AI</span></h1>
        <p className="mt-1 font-mono text-[0.72rem] text-ink-muted">// criar conta</p>
      </div>

      <div className="rounded-card border border-white/10 bg-bg-800/70 p-6">
        {plan && PLAN_LABEL[plan] && (
          <div className="mb-5 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 text-center font-mono text-[0.7rem] text-cyan">
            Criando conta para assinar o plano <b>{PLAN_LABEL[plan]}</b> ({interval === "year" ? "anual" : "mensal"})
          </div>
        )}

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)"
          className="mb-3 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" autoComplete="email"
          className="mb-3 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="Senha (mín. 8)" autoComplete="new-password"
          className="mb-4 w-full rounded-lg border border-white/10 bg-bg-900 px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-cyan focus:outline-none" />

        {err && <p className="mb-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-xs text-crit">{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full rounded-lg bg-cyan py-3 font-display text-sm font-semibold text-bg-900 shadow-neon-cyan transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Criar conta"}
        </button>

        <p className="mt-4 text-center font-mono text-[0.65rem] text-ink-muted">
          Já tem conta? <Link href="/login" className="text-cyan underline">Entrar</Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-ink-muted">Carregando…</main>}>
      <SignupInner />
    </Suspense>
  );
}
