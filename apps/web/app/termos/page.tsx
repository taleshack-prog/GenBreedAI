import { LegalPage, LegalSection } from "../../components/LegalPage";

export const metadata = { title: "GenBreedAI · Termos de Uso" };

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" updated="14 de setembro de 2026">
      <LegalSection title="1. Objeto">
        <p>
          Estes Termos regem o uso do GenBreedAI, um jogo online de genética aplicada. Ao criar uma conta, você recebe uma <b>licença de uso</b> do
          jogo — não a propriedade de qualquer software ou conteúdo. A conta é <b>pessoal e intransferível</b>.
        </p>
      </LegalSection>

      <LegalSection title="2. Espécimes, imagens e conteúdo gerado">
        <p>
          Os espécimes, genótipos, imagens geradas por IA e demais conteúdos criados dentro do jogo são licenciados a você para uso pessoal,
          exclusivamente dentro do GenBreedAI. Esse conteúdo:
        </p>
        <ul>
          <li>não constitui propriedade transferível fora do jogo;</li>
          <li>não tem valor monetário e não pode ser vendido, licenciado ou negociado fora da plataforma.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Créditos e moedas do jogo">
        <p>
          Créditos de imagem, catalisadores, biomassa e qualquer outro recurso interno do jogo são itens de uso dentro da plataforma. Eles
          <b> não são conversíveis em dinheiro</b>, não podem ser sacados e não têm equivalência garantida com o valor pago por eles.
        </p>
      </LegalSection>

      <LegalSection title="4. Condutas vedadas">
        <p>São expressamente proibidos, podendo resultar em suspensão ou encerramento da conta:</p>
        <ul>
          <li>uso de automação, bots, scripts ou qualquer ferramenta para interagir com o jogo em seu lugar;</li>
          <li>exploração de falhas, bugs ou vulnerabilidades para obter vantagem indevida;</li>
          <li>criação de múltiplas contas para burlar cotas diárias/mensais ou o programa de indicação.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar sua conta, sem aviso prévio, em caso de violação destes Termos. Você também pode encerrar sua conta a
          qualquer momento; assinaturas ativas seguem a Política de Reembolso.
        </p>
      </LegalSection>

      <LegalSection title="6. Legislação e foro">
        <p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias, conforme o Código de Defesa do Consumidor.</p>
      </LegalSection>
    </LegalPage>
  );
}
