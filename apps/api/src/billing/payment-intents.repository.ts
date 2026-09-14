/**
 * Porta de persistência de payment_intents (in-memory p/ dev/testes; Drizzle
 * p/ Neon) — mesmo padrão de WalletRepository (economy/wallet.repository.ts).
 *
 * Existe para dar idempotência de crédito ROBUSTA A RESTART: o Stripe reenvia
 * webhook por até 3 dias em retry; um Set em memória zera a cada deploy e
 * credita em dobro. `claimCredit` é a operação atômica que resolve isso.
 */
import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { paymentIntents } from "../db/schema";

export type PaymentIntentKind = "PACK" | "SUBSCRIPTION";

export interface PendingIntentRow {
  id: string; // id do gateway (pi_... ou cs_...)
  userId: string;
  kind: PaymentIntentKind;
  packId: string | null;
  amountBRL: number;
}

export abstract class PaymentIntentsRepository {
  /** Registra a intent como PENDING assim que criada no gateway. Idempotente (ignora se já existir). */
  abstract insertPending(row: PendingIntentRow): Promise<void>;

  /**
   * Credita 1x, atomicamente: marca `credited_at`/`status=PAID` apenas se
   * ainda não creditada (cria a linha na hora se ela não existir — cobre o
   * StubPaymentProvider, que não chama `insertPending`). Retorna `true`
   * somente para a chamada que efetivamente ganhou a corrida; chamadas
   * subsequentes (retry de webhook, `confirm` chamado 2x) recebem `false`.
   */
  abstract claimCredit(row: PendingIntentRow): Promise<boolean>;
}

export class InMemoryPaymentIntentsRepository extends PaymentIntentsRepository {
  private readonly credited = new Set<string>();

  async insertPending(_row: PendingIntentRow): Promise<void> {
    // Nada a fazer: o estado relevante para idempotência é só `credited`.
  }

  async claimCredit(row: PendingIntentRow): Promise<boolean> {
    if (this.credited.has(row.id)) return false;
    this.credited.add(row.id);
    return true;
  }
}

export class DrizzlePaymentIntentsRepository extends PaymentIntentsRepository {
  constructor(private readonly db: Database) { super(); }

  async insertPending(row: PendingIntentRow): Promise<void> {
    await this.db.insert(paymentIntents).values({
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      packId: row.packId,
      amountBrl: row.amountBRL.toString(),
      status: "PENDING",
    }).onConflictDoNothing({ target: paymentIntents.id });
  }

  async claimCredit(row: PendingIntentRow): Promise<boolean> {
    // Upsert atômico: se a linha não existir ainda (stub, ou webhook chegou
    // antes do createIntent persistir), cria já creditada; se existir e
    // `credited_at` for NULL, credita agora; se já tiver `credited_at`, o
    // `setWhere` barra o UPDATE e nenhuma linha retorna — sem corrida.
    const result = await this.db.insert(paymentIntents).values({
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      packId: row.packId,
      amountBrl: row.amountBRL.toString(),
      status: "PAID",
      creditedAt: new Date(),
    }).onConflictDoUpdate({
      target: paymentIntents.id,
      set: { status: "PAID", creditedAt: new Date(), updatedAt: new Date() },
      setWhere: isNull(paymentIntents.creditedAt),
    }).returning({ id: paymentIntents.id });
    return result.length > 0;
  }
}
