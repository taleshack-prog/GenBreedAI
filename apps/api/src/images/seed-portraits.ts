/**
 * Pré-gera os retratos IA de TODOS os fundadores (custo único de créditos na
 * fal.ai). Uso: pnpm --filter @genbreedai/api images:seed  (requer FAL_KEY).
 * Sem FAL_KEY, roda em modo procedural (não gera arquivos).
 */
import "dotenv/config";
import { InMemorySpecimenRepository, founderSeeds } from "../specimens/in-memory.repository";
import { ImageJobRepository } from "./image-job.repository";
import { ImageService } from "./image.service";
import { ImageQuotaService } from "../economy/image-quota.service";
import { WalletService } from "../economy/wallet.service";
import { InMemoryWalletRepository } from "../economy/wallet.repository";

async function main() {
  if (!process.env.FAL_KEY) { console.log("FAL_KEY ausente — modo procedural (nada a gerar). Defina FAL_KEY no .env."); return; }
  const repo = new InMemorySpecimenRepository();
  const svc = new ImageService(repo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
  const ids = founderSeeds().map((f) => f.id);
  console.log(`Gerando ${ids.length} retratos via fal.ai (${process.env.FAL_MODEL ?? "fal-ai/flux/dev"})…`);
  for (const id of ids) {
    try {
      const r = await svc.generate(id, "PHD", false, true); // seed ignora cota
      console.log(`  ${id}: ${r.imageUrl ? "OK " + r.imageUrl : r.status}`);
    } catch (e) { console.error(`  ${id}: FALHA — ${(e as Error).message}`); }
  }
  console.log("Concluído. Reinicie o web para ver os retratos.");
}
main().catch((e) => { console.error(e); process.exit(1); });
