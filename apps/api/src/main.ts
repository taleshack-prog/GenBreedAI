/**
 * Bootstrap NestJS sobre o adapter Fastify (TDD §2). REST /api/v1.
 */
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { assertAuthSecretForBoot } from "./common/auth-secret";
import { assertDatabaseForBoot } from "./common/database-url";
import { assertR2ForBoot } from "./common/r2-config";
import { assertStripeForBoot } from "./common/stripe-config";
import { assertVapidForBoot } from "./common/vapid-config";

export async function buildApp(): Promise<NestFastifyApplication> {
  // ANTES de criar qualquer coisa: em produção a API NÃO sobe (lança aqui) sem
  // AUTH_SECRET válida (assinaria JWT com segredo fraco) nem sem DATABASE_URL
  // (rodaria em memória e perderia tudo a cada reinício, em silêncio) nem com o R2
  // incompleto (os retratos gerados cairiam no disco do contêiner e sumiriam no
  // próximo deploy) nem com o Stripe ligado sem segredo do webhook — falhar ao subir é melhor
  // que subir inseguro/sem persistência/aceitando pagamento que não entrega.
  // Fora de produção só avisa (segredo padrão de dev; dados em memória; disco local).
  assertAuthSecretForBoot();
  assertDatabaseForBoot();
  // R2 (ADR-0031): em produção com FAL_KEY as cinco R2_* são obrigatórias; parcial falha sempre; senão só avisa.
  assertR2ForBoot();
  // Stripe e VAPID (ADR-0031, adendo 2): com STRIPE_SECRET_KEY em produção, webhook secret e URLs https de retorno são obrigatórios
  // (senão o cliente paga e nada é entregue); VAPID pela metade falha em produção. Só o boot HTTP — nunca os scripts (push-cron).
  assertStripeForBoot();
  assertVapidForBoot();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: ["error", "warn", "log"],
      // POST /billing/webhook precisa do corpo BRUTO (Buffer) pra verificar a
      // assinatura Stripe (stripe.webhooks.constructEvent) — com o body já
      // parseado em JSON, a verificação falha sempre. `rawBody: true` faz o
      // Fastify guardar o Buffer original em req.rawBody em TODA requisição
      // JSON, sem afetar o parsing normal do req.body nas outras rotas.
      rawBody: true,
    },
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

process.on("unhandledRejection", (reason) => { console.error("[unhandledRejection] tratado:", reason); });
process.on("uncaughtException", (err: any) => { console.error("[uncaughtException] tratado:", err?.message ?? err); });

async function bootstrap() {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`GenBreedAI API em http://localhost:${port}/api/v1`);
}

// Só inicia o servidor quando executado diretamente (não em testes).
if (process.env.NODE_ENV !== "test") {
  // Falha de boot (ex.: AUTH_SECRET inválida em produção) tem que DERRUBAR o
  // processo com código ≠ 0 — os handlers globais acima só logam ("tratado") e
  // o processo poderia sair com código 0 (Railway não reiniciaria/alertaria).
  bootstrap().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[boot] A API NÃO subiu:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
