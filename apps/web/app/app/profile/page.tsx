"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listSpecimens, getWallet, claimDaily, claimWeekly, getImageQuota, getReferral, referralUrl, getCreditPacks, buyCredits, getMyTier, type ApiSpecimen, type Tier, type Wallet, type ImageQuota, type Referral, type CreditPack } from "../../../lib/api";
import { Screen } from "../../../components/Screen";
import { getUser, clearSession } from "../../../lib/auth";

const TIER_NAME: Record<Tier, string> = {
  FREE: "FREEBREEDER",
  JUNIOR: "JUNIOR BREEDER",
  SENIOR: "SENIOR BREEDER",
  PHD: "PHD BREEDER",
};

export default function ProfilePage() {
  const [items, setItems] = useState<ApiSpecimen[]>([]);
  // Tier efetivo (nome + limites) vem só de GET /api/v1/me/tier (TierService no
  // backend). Nunca mais de um seletor local — dailyCrosses/imgsMonth ficam
  // null até a resposta chegar (evita mostrar "FREE" errado por 1 instante).
  const [tier, setTierState] = useState<Tier>("FREE");
  const [tierLimits, setTierLimits] = useState<{ dailyCrosses: number; imgsMonth: number } | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [imgQuota, setImgQuota] = useState<ImageQuota | null>(null);
  const [ref, setRef] = useState<Referral | null>(null);
  const [copied, setCopied] = useState(false);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [dailyMsg, setDailyMsg] = useState<string | null>(null);
  useEffect(() => {
    // Tier efetivo (TierService: assinatura → granted_tiers → FREE) — nunca do
    // JWT nem de /billing/subscription sozinho, que só enxerga Stripe e por
    // isso mostraria FREE pra quem tem PHD concedido fora do Stripe.
    getMyTier()
      .then((t) => { setTierState(t.tier); setTierLimits({ dailyCrosses: t.dailyCrosses, imgsMonth: t.monthlyImages }); })
      .catch(() => setTierState("FREE"));
    getWallet().then(setWallet).catch(() => {});
    getImageQuota().then(setImgQuota).catch(() => {});
    getReferral().then(setRef).catch(() => {});
    getCreditPacks().then(setPacks).catch(() => {});
  }, []);
  async function comprar(packId: string) {
    setBuying(packId); setBuyMsg(null);
    try {
      const r = await buyCredits(packId);
      if (r.redirected) return; // navegando para o checkout do Stripe
      setWallet(r.wallet); setBuyMsg(`+${r.creditsAdded} créditos de imagem!`);
    } catch (e) { setBuyMsg((e as Error).message); } finally { setBuying(null); }
  }
  async function coletarSemanal() {
    try { const r = await claimWeekly(); setWallet(r.wallet); setDailyMsg(r.claimed ? "+1 crédito de imagem (bônus semanal)!" : "Bônus semanal já coletado. Volte na próxima semana."); }
    catch (e) { setDailyMsg((e as Error).message); }
  }
  function shareLink(via: "whatsapp" | "email" | "sms" | "copy") {
    if (!ref) return;
    const url = referralUrl(ref.code);
    const msg = `Cria animais com genética real no GenBreedAI! Entra pelo meu link e a gente ganha créditos: ${url}`;
    if (via === "copy") { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); return; }
    if (navigator.share && via === "whatsapp") { navigator.share({ title: "GenBreedAI", text: msg, url }).catch(() => {}); return; }
    const links: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(msg)}`,
      email: `mailto:?subject=${encodeURIComponent("Joga GenBreedAI comigo")}&body=${encodeURIComponent(msg)}`,
      sms: `sms:?&body=${encodeURIComponent(msg)}`,
    };
    window.open(links[via], "_blank");
  }
  async function coletar() {
    try {
      const r = await claimDaily();
      setWallet(r.wallet);
      setDailyMsg(r.claimed ? `+${r.gain!.catalisadores} catalisadores, +${r.gain!.biomassa} biomassa!` : "Você já coletou hoje. Volte amanhã.");
    } catch (e) { setDailyMsg((e as Error).message); }
  }
  useEffect(() => { listSpecimens().then(setItems).catch(() => {}); }, []);
  const total = items.length;
  const hybrids = items.filter((s) => s.method !== "FOUNDER" && s.sireId !== null).length;
  const stat = (label: string, value: string | number) => (
    <div className="rounded-card border border-cyan/20 bg-bg-800 p-4 text-center">
      <div className="font-display text-2xl font-bold text-cyan">{value}</div>
      <div className="text-[0.7rem] uppercase text-ink-muted">{label}</div>
    </div>
  );
  return (
    <Screen title="Perfil" subtitle="Criador">
      <div className="mb-5 flex items-center gap-4 rounded-card border border-purple/30 bg-bg-800 p-4 neon-purpura">
        <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-purple text-2xl">🧬</div>
        <div className="flex-1">
          <div className="font-display text-lg font-bold uppercase text-ink">{getUser()?.name || getUser()?.email || "Criador"}</div>
          <div className="text-sm text-purple">{TIER_NAME[tier] ?? TIER_NAME.FREE}</div>
          {tierLimits && (
            <div className="mt-1 text-xs text-ink-muted">{tierLimits.dailyCrosses} cruzamentos/dia · {tierLimits.imgsMonth} imagens IA/mês</div>
          )}
        </div>
        {tier !== "PHD" && (
          <Link href="/app/planos" className="shrink-0 rounded-lg border border-purple/40 px-3 py-2 text-center font-display text-[0.68rem] font-bold uppercase tracking-wide text-purple transition hover:bg-purple/10">
            {tier === "FREE" ? "Assinar" : "Ver planos"}
          </Link>
        )}
      </div>
      {(() => { const u = getUser(); return u ? (
        <div className="mb-5 flex items-center justify-between rounded-card border border-white/10 bg-bg-800/70 p-4">
          <div>
            <div className="font-display text-sm font-semibold text-ink">{u.name || u.email || "Criador"}</div>
            <div className="font-mono text-[0.65rem] text-ink-muted">{u.email} · {u.tier}</div>
          </div>
          <button onClick={() => { clearSession(); location.href = "/login"; }} className="rounded-lg border border-crit/30 px-3 py-1.5 font-mono text-[0.7rem] uppercase text-crit transition hover:bg-crit/10">Sair da conta</button>
        </div>
      ) : null; })()}
      {wallet && (
        <div className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-xs font-bold uppercase text-cyan">Recursos</div>
            <div className="flex gap-2">
              <span className="rounded border border-cyan/30 px-2 py-1 text-xs"><span className="text-cyan">⬢</span> {wallet.catalisadores.toLocaleString()}</span>
              <span className="rounded border border-ok/30 px-2 py-1 text-xs"><span className="text-ok">🌿</span> {wallet.biomassa.toLocaleString()}</span>
            </div>
          </div>
          <button onClick={coletar} className="w-full rounded-lg bg-ok py-2.5 font-display text-sm font-bold uppercase text-bg-900 shadow-neon-green transition hover:brightness-110">
            ☀ Coletar recompensa diária
          </button>
          <button onClick={coletarSemanal} className="mt-2 w-full rounded-lg border border-purple/40 py-2 font-display text-xs uppercase text-purple transition hover:bg-purple/10">
            🖼 Coletar imagem semanal (+1 crédito)
          </button>
          {wallet.imageCredits !== undefined && <div className="mt-2 text-center text-[0.7rem] text-purple">Créditos de imagem: {wallet.imageCredits ?? 0}</div>}
          {dailyMsg && <p className="mt-2 text-center text-xs text-cyan">{dailyMsg}</p>}
          {imgQuota && (
            <div className="mt-3 rounded-lg border border-purple/30 bg-bg-900/50 p-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-[0.65rem] uppercase text-purple">Imagens IA este mês</span>
                <span className="font-mono text-sm text-ink">{imgQuota.remaining} / {imgQuota.limit}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-purple" style={{ width: `${imgQuota.limit ? (imgQuota.used / imgQuota.limit) * 100 : 0}%` }} />
              </div>
              <p className="mt-1.5 text-[0.65rem] text-ink-muted">Prévias são procedurais (grátis). O retrato IA final consome a cota. Excedeu → créditos.</p>
            </div>
          )}
          <p className="mt-2 text-[0.7rem] text-ink-muted">Fontes de recursos: recompensa diária (por tier), fixação de linhagem (aura 4/5 rende), cota do tier. Congelar custa pouco (20).</p>
        </div>
      )}

      {packs.length > 0 && (
        <div className="mb-5 rounded-card border border-cyan/20 bg-bg-800 p-4">
          <div className="mb-1 font-display text-xs font-bold uppercase text-cyan">Comprar créditos de imagem</div>
          <p className="mb-3 text-[0.7rem] text-ink-muted">Créditos geram retratos IA além da sua cota mensal. 1 crédito = 1 imagem.</p>
          <div className="grid grid-cols-3 gap-2">
            {packs.map((p) => (
              <button key={p.id} disabled={buying === p.id} onClick={() => comprar(p.id)}
                className="rounded-lg border border-cyan/30 bg-bg-900 p-3 text-center transition hover:border-cyan hover:bg-cyan/5 disabled:opacity-50">
                <div className="font-display text-lg font-black text-cyan">{p.credits}</div>
                <div className="text-[0.6rem] uppercase text-ink-muted">créditos</div>
                <div className="mt-1 font-mono text-xs text-ink">R$ {p.priceBRL.toFixed(2)}</div>
                {buying === p.id && <div className="mt-1 text-[0.6rem] text-cyan">processando…</div>}
              </button>
            ))}
          </div>
          {buyMsg && <p className="mt-2 text-center text-xs text-ok">{buyMsg}</p>}
        </div>
      )}

      {ref && (
        <div className="mb-5 rounded-card border border-purple/30 bg-bg-800 p-4">
          <div className="mb-1 font-display text-xs font-bold uppercase text-purple">Indique e ganhe créditos de imagem</div>
          <p className="mb-3 text-[0.7rem] text-ink-muted">Compartilhe seu link. Você ganha créditos conforme quem entra engaja: instalou +1 · voltou D1 +1 · ativo D7 +2 · virou assinante +15.</p>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-bg-900 p-2">
            <span className="flex-1 truncate font-mono text-xs text-ink">{referralUrl(ref.code)}</span>
            <button onClick={() => shareLink("copy")} className="rounded border border-cyan/40 px-2 py-1 text-[0.65rem] uppercase text-cyan">{copied ? "copiado!" : "copiar"}</button>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <button onClick={() => shareLink("whatsapp")} className="rounded-lg bg-ok py-2 font-display text-xs font-bold uppercase text-bg-900">WhatsApp</button>
            <button onClick={() => shareLink("email")} className="rounded-lg border border-cyan/40 py-2 font-display text-xs uppercase text-cyan">Email</button>
            <button onClick={() => shareLink("sms")} className="rounded-lg border border-cyan/40 py-2 font-display text-xs uppercase text-cyan">SMS</button>
          </div>
          <div className="grid grid-cols-5 gap-1 text-center text-[0.6rem]">
            {[["Cliques", ref.clicks], ["Instalou", ref.installs], ["D1", ref.d1], ["D7", ref.d7], ["Assinou", ref.conversions]].map(([l, v]) => (
              <div key={l as string} className="rounded bg-bg-900/60 py-1.5"><div className="font-mono text-sm text-ink">{v as number}</div><div className="uppercase text-ink-muted">{l as string}</div></div>
            ))}
          </div>
          <div className="mt-2 text-center text-[0.7rem] text-purple">Créditos de imagem ganhos: {ref.creditsEarned}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {stat("Espécimes", total)}
        {stat("Híbridos", hybrids)}
        {stat("Streak", "0")}
      </div>
    </Screen>
  );
}
