/**
 * BUG em produção: POST /api/v1/incubator/:id/gestate (e outras) mandava
 * `Content-Type: application/json` sem `body` — Fastify recusa com "body
 * cannot be empty when content-type is set to 'application/json'" antes
 * mesmo de chegar no controller. Este teste garante, SEM REDE (`fetch`
 * mockado via `vi.stubGlobal`), que toda função de POST/DELETE sem corpo
 * próprio manda um `body` não-vazio junto com esse header — nunca os dois
 * sozinhos.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import * as api from "../api";

/** Captura a chamada real a `fetch` feita por `run()` e devolve seus `RequestInit`. */
async function captureRequestInit(run: () => Promise<unknown>): Promise<RequestInit> {
  let captured: RequestInit | undefined;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    captured = init;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  await run();
  expect(captured, "fetch não foi chamado").toBeDefined();
  return captured!;
}

/** O bug exato reportado: content-type json declarado, body ausente/vazio. */
function assertNoEmptyJsonBody(init: RequestInit) {
  const headers = init.headers as Record<string, string> | undefined;
  const contentType = headers?.["content-type"] ?? headers?.["Content-Type"];
  if (contentType && contentType.includes("application/json")) {
    expect(init.body, "Content-Type: application/json sem body — Fastify recusa (FST_ERR_CTP_EMPTY_JSON_BODY)").toBeTruthy();
    expect(init.body).not.toBe("");
  }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("requisições sem corpo próprio nunca mandam Content-Type: application/json sozinho", () => {
  it("gestateEntry — POST /incubator/:id/gestate (era o bug reportado)", async () => {
    const init = await captureRequestInit(() => api.gestateEntry("incu_1"));
    expect(init.method).toBe("POST");
    assertNoEmptyJsonBody(init);
  });

  it("bornEntry — POST /incubator/:id/born (mesmo bug, não reportado ainda)", async () => {
    const init = await captureRequestInit(() => api.bornEntry("incu_1"));
    expect(init.method).toBe("POST");
    assertNoEmptyJsonBody(init);
  });

  it("discardEntry — DELETE /incubator/:id (mesmo bug: manda content-type sem body)", async () => {
    const init = await captureRequestInit(() => api.discardEntry("incu_1"));
    expect(init.method).toBe("DELETE");
    assertNoEmptyJsonBody(init);
  });

  it("subscribePush / unsubscribePush (Web Push, ADR-0028) — POST e DELETE sempre com corpo JSON (a assinatura / o endpoint)", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };
    const post = await captureRequestInit(() => api.subscribePush(sub));
    expect(post.method).toBe("POST");
    assertNoEmptyJsonBody(post);
    expect(JSON.parse(post.body as string)).toEqual(sub);

    const del = await captureRequestInit(() => api.unsubscribePush(sub.endpoint));
    expect(del.method).toBe("DELETE");
    assertNoEmptyJsonBody(del);
    expect(JSON.parse(del.body as string)).toEqual({ endpoint: sub.endpoint });
  });

  it("claimDaily — já mandava body '{}', continua correto", async () => {
    const init = await captureRequestInit(() => api.claimDaily());
    assertNoEmptyJsonBody(init);
  });

  it("claimBiweekly — já mandava body '{}', continua correto", async () => {
    const init = await captureRequestInit(() => api.claimBiweekly());
    assertNoEmptyJsonBody(init);
  });

  it("freezeSpecimen / thawSpecimen (gene-bank) — já mandavam body '{}', continuam corretos", async () => {
    assertNoEmptyJsonBody(await captureRequestInit(() => api.freezeSpecimen("s1")));
    assertNoEmptyJsonBody(await captureRequestInit(() => api.thawSpecimen("s1")));
  });

  it("postCross/generateImage/classifyCross (corpo próprio, sempre tiveram body) — continuam corretos", async () => {
    assertNoEmptyJsonBody(await captureRequestInit(() => api.postCross({ sireId: "a", damId: "b", method: "F1" })));
    assertNoEmptyJsonBody(await captureRequestInit(() => api.generateImage("s1")));
    assertNoEmptyJsonBody(await captureRequestInit(() => api.classifyCross({ sireId: "a", damId: "b" })));
  });
});
