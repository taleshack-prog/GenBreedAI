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

export async function buildApp(): Promise<NestFastifyApplication> {
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
  bootstrap();
}
