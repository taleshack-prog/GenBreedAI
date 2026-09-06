import { Screen, ComingSoon } from "../../components/Screen";
export default function MarketPage() {
  return (
    <Screen title="Mercado" subtitle="Comércio com escrow — exclusivo PhD Breeder">
      <ComingSoon>
        O Mercado com escrow é um recurso do tier <b className="text-ink">PhD Breeder</b> (TDD §7.4).
        A tela e a lógica de leilão/escrow entram após a governança econômica anti-fraude.
      </ComingSoon>
    </Screen>
  );
}
