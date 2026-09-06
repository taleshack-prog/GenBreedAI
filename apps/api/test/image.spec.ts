import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageService } from "../src/images/image.service";
import { buildPrompt, traitVector } from "../src/images/prompt";

describe("Pipeline de imagem (TDD §5)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: ImageService;
  beforeEach(() => { delete process.env.FAL_KEY; repo = new InMemorySpecimenRepository(); svc = new ImageService(repo, new ImageJobRepository()); });

  it("prompt é determinístico e descreve a espécie/traços", async () => {
    const onca = (await repo.get("onca-pintada"))!;
    const p1 = buildPrompt(onca), p2 = buildPrompt(onca);
    expect(p1).toBe(p2);
    expect(p1.toLowerCase()).toContain("jaguar");
    expect(p1).toContain("#0A0E14");
    expect(traitVector(onca)).toContain("rosettes");
  });

  it("tigre → traço de listras; guepardo → pintas", async () => {
    expect(traitVector((await repo.get("tigre-bengala"))!)).toContain("stripes");
    expect(traitVector((await repo.get("guepardo"))!)).toContain("spots");
    expect(traitVector((await repo.get("gato-branco"))!)).toContain("pure white coat");
  });

  it("sem FAL_KEY → modo procedural (APPROVED, sem imageUrl, model=procedural)", async () => {
    const r = await svc.generate("onca-pintada", "FREE");
    expect(r.status).toBe("APPROVED");
    expect(r.model).toBe("procedural");
    expect(r.imageUrl).toBeNull();
    expect(r.cacheKey).toBeTruthy();
  });

  it("getCached retorna estado sem imagem quando não há cache", async () => {
    const r = await svc.getCached("puma");
    expect(r?.imageUrl).toBeNull();
  });
});
