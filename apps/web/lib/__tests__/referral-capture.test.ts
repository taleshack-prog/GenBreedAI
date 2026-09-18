/**
 * Captura do `?ref=` (ADR-0024): funções puras + o envio no cadastro
 * (`register`/`loginWithGoogle` em lib/auth.ts), com `window`/`fetch`
 * simulados — sem rede nem DOM real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sanitizeRef, readRefFromSearch, captureRef, getStoredRef, clearStoredRef, storeRef,
  REF_STORAGE_KEY, REF_TTL_MS, type StorageLike,
} from "../referral-capture";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

describe("sanitizeRef / readRefFromSearch", () => {
  it("aceita só o formato de código", () => {
    expect(sanitizeRef("abc123xyz")).toBe("abc123xyz");
    expect(sanitizeRef("  ABC123  ")).toBe("ABC123");
    expect(sanitizeRef("")).toBeNull();
    expect(sanitizeRef(null)).toBeNull();
    expect(sanitizeRef("<script>")).toBeNull();
    expect(sanitizeRef("a b")).toBeNull();
    expect(sanitizeRef("x".repeat(65))).toBeNull();
  });

  it("lê ?ref= de qualquer query (landing, /f/[id], /signup)", () => {
    expect(readRefFromSearch("?ref=abc123xyz")).toBe("abc123xyz");
    expect(readRefFromSearch("?plan=JUNIOR&ref=abc123xyz&interval=year")).toBe("abc123xyz");
    expect(readRefFromSearch("?plan=JUNIOR")).toBeNull();
    expect(readRefFromSearch("")).toBeNull();
    expect(readRefFromSearch("?ref=%3Cscript%3E")).toBeNull();
  });
});

describe("captureRef / getStoredRef", () => {
  it("guarda o código da URL e o devolve depois", () => {
    const s = memoryStorage();
    expect(captureRef("?ref=abc123xyz", s, 1000)).toBe("abc123xyz");
    expect(getStoredRef(s, 2000)).toBe("abc123xyz");
  });

  it("URL sem ref (ou inválido) não guarda nada e não apaga o que já havia", () => {
    const s = memoryStorage();
    captureRef("?ref=primeiro1", s, 1000);
    expect(captureRef("?foo=1", s, 2000)).toBeNull();
    expect(captureRef("?ref=%3C", s, 2000)).toBeNull();
    expect(getStoredRef(s, 3000)).toBe("primeiro1");
  });

  it("último toque vence", () => {
    const s = memoryStorage();
    captureRef("?ref=primeiro1", s, 1000);
    captureRef("?ref=segundo22", s, 2000);
    expect(getStoredRef(s, 3000)).toBe("segundo22");
  });

  it("expira depois de 30 dias e é descartado", () => {
    const s = memoryStorage();
    storeRef(s, "abc123xyz", 0);
    expect(getStoredRef(s, REF_TTL_MS - 1)).toBe("abc123xyz");
    expect(getStoredRef(s, REF_TTL_MS + 1)).toBeNull();
    expect(s.data.has(REF_STORAGE_KEY)).toBe(false);
  });

  it("valor corrompido no storage vira null (não lança)", () => {
    const s = memoryStorage();
    s.setItem(REF_STORAGE_KEY, "{isso não é json");
    expect(getStoredRef(s)).toBeNull();
    s.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "<x>", at: 1 }));
    expect(getStoredRef(s, 2)).toBeNull();
  });

  it("storage que lança (modo privado) nunca quebra", () => {
    const boom: StorageLike = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    expect(() => captureRef("?ref=abc123xyz", boom)).not.toThrow();
    expect(getStoredRef(boom)).toBeNull();
    expect(() => clearStoredRef(boom)).not.toThrow();
  });
});

describe("cadastro envia o ref guardado (lib/auth.ts)", () => {
  let store: ReturnType<typeof memoryStorage>;
  let bodies: unknown[];

  beforeEach(() => {
    store = memoryStorage();
    bodies = [];
    vi.stubGlobal("window", { localStorage: store });
    vi.stubGlobal("localStorage", store);
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ token: "t", user: { id: "u1", email: "a@b.com", name: null, tier: "FREE" } }) };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("register com ref guardado → manda `ref` no corpo e limpa o storage depois", async () => {
    const { register } = await import("../auth");
    captureRef("?ref=abc123xyz", store, Date.now());
    await register("a@b.com", "senha12345", "Ana");
    expect(bodies[0]).toEqual({ email: "a@b.com", password: "senha12345", name: "Ana", ref: "abc123xyz" });
    expect(getStoredRef(store)).toBeNull();
  });

  it("register SEM ref guardado → corpo sem a chave `ref`", async () => {
    const { register } = await import("../auth");
    await register("a@b.com", "senha12345");
    expect(Object.keys(bodies[0] as object)).not.toContain("ref");
  });

  it("register que FALHA mantém o ref guardado (o usuário tenta de novo)", async () => {
    const { register } = await import("../auth");
    captureRef("?ref=abc123xyz", store, Date.now());
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Este e-mail já está cadastrado." }) });
    await expect(register("a@b.com", "senha12345")).rejects.toThrow(/já está cadastrado/);
    expect(getStoredRef(store)).toBe("abc123xyz");
  });

  it("loginWithGoogle também manda o ref", async () => {
    const { loginWithGoogle } = await import("../auth");
    captureRef("?ref=abc123xyz", store, Date.now());
    await loginWithGoogle("id-token");
    expect(bodies[0]).toEqual({ idToken: "id-token", ref: "abc123xyz" });
  });
});
