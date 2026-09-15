"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { register } from "../../lib/auth";
import { subscribeToPlan } from "../../lib/api";
import { PlanPicker } from "../../components/PlanPicker";
import { PLANS, type PlanId, type PlanInterval } from "../../lib/plans";

const PLAN_LABEL: Record<string, string> = { FREE: "Free", JUNIOR: "Junior", SENIOR: "Senior", PHD: "PhD" };

function isPlanId(v: string | null): v is PlanId {
  return v !== null && PLANS.some((p) => p.id === v);
}

function SignupInner() {
  const router = useRouter();
  const search = useSearchParams();
  const planParam = search.get("plan");
  const interval: PlanInterval = search.get("interval") === "year" ? "year" : "month";
  const preselectedPlan = isPlanId(planParam) ? planParam : null;

  const [step, setStep] = useState<"form" | "pickPlan">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [subscribing, setSubscribing] = useState<PlanId | null>(null);

  /** Free entra direto no jogo; pago cria a Checkout Session e redireciona pro Stripe. */
  async function choosePlan(plan: PlanId, chosenInterval: PlanInterval) {
    if (plan === "FREE") { router.push("/app"); return; }
    setErr(null); setSubscribing(plan);
    try {
      const { checkoutUrl } = await subscribeToPlan(plan, chosenInterval);
      window.location.href = checkoutUrl;
    } catch (e) { setErr((e as Error).message); setSubscribing(null); }
  }

  async function submit() {
    setErr(null); setBusy(true);
    try {
      await register(email, password, name || undefined);
      if (preselectedPlan) {
        // Veio de um CTA de plano na landing (/signup?plan=X&interval=Y) — pula
        // a tela de escolha e vai direto pro checkout do plano escolhido.
        await choosePlan(preselectedPlan, interval);
      } else {
        // Cadastro "genérico" (botão Criar conta do hero) — ainda sem plano
        // definido: mostra a escolha (mesmo conteúdo de planos da landing).
        setStep("pickPlan");
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (step === "pickPlan") {
    return (
      <main className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-black uppercase tracking-wide text-ink sm:text-3xl">Escolha seu plano</h1>
          <p className="mt-2 text-sm text-ink-muted">Conta criada! Comece grátis ou assine para desbloquear mais cruzamentos, imagens e espécies.</p>
        </div>
        {err && <p className="mx-auto mb-5 max-w-md rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-center text-xs text-crit">{err}</p>}
        <PlanPicker onSelect={choosePlan} busyPlan={subscribing} ctaLabel={(p) => p.id === "FREE" ? "Entrar no jogo" : "Assinar"} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">GenBreed<span className="text-cyan">AI</span></h1>
        <p className="mt-1 font-mono text-[0.72rem] text-ink-muted">// criar conta</p>
      </div>

      <div className="rounded-card border border-white/10 bg-bg-800/70 p-6">
        {preselectedPlan && PLAN_LABEL[preselectedPlan] && (
          <div className="mb-5 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 text-center font-mono text-[0.7rem] text-cyan">
            Criando conta para assinar o plano <b>{PLAN_LABEL[preselectedPlan]}</b> ({interval === "year" ? "anual" : "mensal"})
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
