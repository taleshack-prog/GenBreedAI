/**
 * Modelo único FLUX.2 [pro] (fal-ai/flux-2-pro) pra todo tier. Testa o
 * PAYLOAD enviado à fal — sem chamar a rede de verdade (fetch mockado, mesmo
 * padrão já usado em image-access.spec.ts/included-portrait.spec.ts).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { FalImageProvider, resolveProvider, ProceduralImageProvider } from "../src/images/provider";

describe("FalImageProvider — payload do FLUX.2 [pro]", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.FAL_MODEL; });

  it("modelo padrão (sem FAL_MODEL) é fal-ai/flux-2-pro", () => {
    delete process.env.FAL_MODEL;
    const p = new FalImageProvider("fake-key");
    expect(p.model).toBe("fal-ai/flux-2-pro");
  });

  it("payload NÃO contém num_inference_steps nem guidance_scale (FLUX.2 [pro] não usa)", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://fal.run/")) {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ images: [{ url: "https://fake.test/img.png" }] }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }));

    const p = new FalImageProvider("fake-key");
    await p.generate("um gato", "cache-key-teste");

    expect(calls).toHaveLength(1);
    const body = calls[0]!;
    expect(body).not.toHaveProperty("num_inference_steps");
    expect(body).not.toHaveProperty("guidance_scale");
  });

  it("payload mantém prompt, seed determinística, tamanho 1024x1024, safety checker e formato png", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://fal.run/")) {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ images: [{ url: "https://fake.test/img.png" }] }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }));

    const p = new FalImageProvider("fake-key");
    await p.generate("um gato malhado", "cache-key-teste");

    expect(calls).toHaveLength(1);
    const body = calls[0]!;

    expect(body).toMatchObject({
      prompt: "um gato malhado",
      image_size: "square_hd", // 1024x1024, mesma convenção já usada pros outros modelos FLUX aqui
      enable_safety_checker: true,
      output_format: "png",
    });
    expect(typeof body.seed).toBe("number"); // numericSeed(cacheKey) — determinístico
  });

  it("FAL_MODEL definida sobrescreve o padrão", () => {
    process.env.FAL_MODEL = "fal-ai/outro-modelo";
    const p = new FalImageProvider("fake-key");
    expect(p.model).toBe("fal-ai/outro-modelo");
  });
});

describe("resolveProvider", () => {
  afterEach(() => { delete process.env.FAL_KEY; });

  it("sem FAL_KEY → ProceduralImageProvider (sem custo, sem rede)", () => {
    delete process.env.FAL_KEY;
    expect(resolveProvider()).toBeInstanceOf(ProceduralImageProvider);
  });

  it("com FAL_KEY → FalImageProvider", () => {
    process.env.FAL_KEY = "fake-key";
    expect(resolveProvider("fal-ai/flux-2-pro")).toBeInstanceOf(FalImageProvider);
  });
});
