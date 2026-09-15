"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSubscription, subscribeToPlan, effectiveTierFromSubscription, type SubscriptionInfo } from "../../../lib/api";
import { PlanPicker } from "../../../components/PlanPicker";
import { type PlanId, type PlanInterval } from "../../../lib/plans";
import { Screen } from "../../../components/Screen";

const PLAN_LABEL: Record<PlanId, string> = { FREE: "Free", JUNIOR: "Junior", SENIOR: "Senior", PHD: "PhD" };

/** ACTIVE, ou PAST_DUE ainda dentro do período — mesma regra do TierService. */
function isActive(sub: SubscriptionInfo): boolean {
  return sub.status === "ACTIVE" || (sub.status === "PAST_DUE" && new Date(sub.currentPeriodEnd).getTime() > Date.now());
}

export default function PlanosPage() {
  const router = useRouter();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<PlanId | null>(null);

  useEffect(() => {
    getSubscription().then(setSub).catch((e) => setErr((e as Error).message)).finally(() => setLoading(false));
  }, []);

  const currentTier = effectiveTierFromSubscription(sub);
  const activeSub = sub && isActive(sub) ? sub : null;

  /** Free entra direto no jogo; pago cria a Checkout Session e redireciona pro Stripe. */
  async function choose(plan: PlanId, interval: PlanInterval) {
    if (plan === currentTier) return; // já é o plano vigente — o card já vem desabilitado
    if (plan === "FREE") { router.push("/app"); return; }
    setErr(null); setSubscribing(plan);
    try {
      const { checkoutUrl } = await subscribeToPlan(plan, interval);
      window.location.href = checkoutUrl;
    } catch (e) { setErr((e as Error).message); setSubscribing(null); }
  }

  return (
    <Screen title="Planos" subtitle="Assinatura">
      {loading ? (
        <p className="py-10 text-center text-sm text-ink-muted">Carregando…</p>
      ) : (
        <>
          {activeSub ? (
            <div className="mb-6 rounded-card border border-cyan/30 bg-cyan/10 p-4 text-center">
              <div className="font-mono text-[0.62rem] uppercase tracking-widest text-cyan">Assinatura ativa</div>
              <div className="mt-1 font-display text-xl font-black text-ink">{PLAN_LABEL[activeSub.tier]} · {activeSub.interval === "YEAR" ? "anual" : "mensal"}</div>
              <div className="mt-1 text-xs text-ink-muted">
                {activeSub.cancelAtPeriodEnd
                  ? `Cancelamento agendado — acesso até ${new Date(activeSub.currentPeriodEnd).toLocaleDateString("pt-BR")}`
                  : `Renova em ${new Date(activeSub.currentPeriodEnd).toLocaleDateString("pt-BR")}`}
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-card border border-white/10 bg-bg-800/60 p-4 text-center">
              <div className="font-mono text-[0.62rem] uppercase tracking-widest text-ink-muted">Você está no plano</div>
              <div className="mt-1 font-display text-xl font-black text-ink">Free</div>
              {sub && sub.status !== "ACTIVE" && (
                <div className="mt-1 text-xs text-ink-muted">
                  Sua última assinatura ({PLAN_LABEL[sub.tier]}) está {sub.status === "CANCELED" ? "cancelada" : sub.status === "PAST_DUE" ? "com pagamento vencido" : "incompleta"}.
                </div>
              )}
            </div>
          )}

          {err && <p className="mb-4 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-center text-xs text-crit">{err}</p>}

          <PlanPicker onSelect={choose} busyPlan={subscribing} currentPlan={currentTier} />
        </>
      )}
    </Screen>
  );
}
