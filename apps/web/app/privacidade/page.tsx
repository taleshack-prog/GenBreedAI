import { LegalPage, LegalSection } from "../../components/LegalPage";

export const metadata = { title: "GenBreedAI · Privacidade" };

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updated="14 de setembro de 2026">
      <LegalSection title="1. Controlador">
        <p>
          O controlador dos dados pessoais tratados por este serviço é <b>[RAZÃO SOCIAL]</b>, inscrita no CNPJ sob o nº <b>[CNPJ]</b>,
          com endereço em <b>[ENDEREÇO]</b> ("GenBreedAI", "nós").
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        <ul>
          <li>Dados de cadastro: e-mail e senha. A senha nunca é armazenada em texto puro — guardamos apenas seu hash (bcrypt), que não pode ser revertido.</li>
          <li>Dados de jogo: espécimes, genótipos, linhagens (pedigree), cruzamentos, carteira de recursos e progresso.</li>
          <li>
            Dados de pagamento: o processamento de assinaturas e compras de créditos é feito pelo Stripe. O GenBreedAI <b>não armazena
            dados de cartão de crédito</b> — recebemos do Stripe apenas identificadores de cobrança e o status do pagamento.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para que usamos esses dados">
        <ul>
          <li>Criar e operar sua conta;</li>
          <li>Executar o jogo (cruzamentos, cálculo genético, cota diária/mensal por tier);</li>
          <li>Processar assinaturas e compras de créditos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Base legal (LGPD, Lei 13.709/2018)">
        <p>Tratamos esses dados com base na <b>execução de contrato</b> (art. 7º, V, da LGPD) — são necessários para prestar o serviço que você contratou ao criar a conta.</p>
      </LegalSection>

      <LegalSection title="5. Com quem compartilhamos">
        <p>Usamos os seguintes prestadores de serviço para operar o GenBreedAI, cada um recebendo apenas os dados necessários à sua função:</p>
        <ul>
          <li><b>Stripe</b> — processamento de pagamentos e assinaturas;</li>
          <li><b>fal.ai</b> — geração de imagens por IA a partir do genótipo do espécime;</li>
          <li><b>Cloudflare R2</b> — armazenamento das imagens geradas;</li>
          <li><b>Neon</b> — banco de dados (PostgreSQL gerenciado);</li>
          <li><b>Vercel</b> e <b>Railway</b> — hospedagem da aplicação (frontend e API, respectivamente).</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Seus direitos como titular">
        <p>
          Nos termos da LGPD, você pode solicitar a qualquer momento: acesso aos seus dados, correção de dados incompletos ou desatualizados,
          exclusão dos seus dados, e portabilidade para outro fornecedor. Para exercer qualquer um desses direitos, escreva para <b>[E-MAIL DE CONTATO]</b>.
        </p>
      </LegalSection>

      <LegalSection title="7. Retenção e exclusão de conta">
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa. Ao solicitar a exclusão da conta em <b>[E-MAIL DE CONTATO]</b>, apagamos os
          dados pessoais associados a ela, ressalvado o que a lei exigir manter por período determinado (por exemplo, registros fiscais de pagamento).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
