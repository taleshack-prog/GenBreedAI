import { LegalPage, LegalSection } from "../../components/LegalPage";

export const metadata = { title: "GenBreedAI · Reembolso" };

export default function ReembolsoPage() {
  return (
    <LegalPage title="Política de Reembolso" updated="14 de setembro de 2026">
      <LegalSection title="1. Direito de arrependimento (art. 49 do CDC)">
        <p>
          Nos termos do art. 49 da Lei nº 8.078/1990 (Código de Defesa do Consumidor), você pode desistir de uma assinatura ou de uma compra
          de créditos em até <b>7 (sete) dias corridos</b> a contar da contratação, com <b>devolução integral</b> do valor pago,
          sem necessidade de justificativa.
        </p>
      </LegalSection>

      <LegalSection title="2. Após os 7 dias">
        <p>
          Passado esse prazo, assinaturas podem ser canceladas a qualquer tempo. O cancelamento tem efeito ao <b>fim do ciclo já pago</b>
          (mensal ou anual) — ou seja, você mantém acesso ao tier contratado até o fim do período vigente, mas <b>sem reembolso proporcional</b>
          pelo tempo não utilizado.
        </p>
      </LegalSection>

      <LegalSection title="3. Créditos já consumidos">
        <p>
          Créditos de imagem já utilizados (ou seja, que já geraram um retrato) não são reembolsáveis, dentro ou fora do prazo de arrependimento,
          por já terem sido efetivamente prestados.
        </p>
      </LegalSection>

      <LegalSection title="4. Como solicitar">
        <p>
          Envie o pedido de reembolso ou cancelamento para <b>[E-MAIL DE CONTATO]</b>, informando o e-mail da sua conta e a data da cobrança.
          Respondemos e processamos o pedido em até <b>[PRAZO DE RESPOSTA]</b>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
