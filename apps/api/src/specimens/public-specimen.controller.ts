/**
 * Rota PÚBLICA (compartilhamento viral, sem login) — GET /api/v1/public/
 * specimens/:id. Serve a página `/f/[id]` da web (Open Graph pro WhatsApp) e
 * nada mais: nenhum `@UseGuards`, de propósito (não há guard global em
 * `main.ts` — uma rota só fica protegida se `@UseGuards(AuthGuard)` estiver
 * nela).
 *
 * SEGURANÇA (reportado no pedido, item 4): a resposta é uma projeção
 * ESTRITA — só `id`, `displayName`, `species`, `aura`, `sex`, `generation`,
 * `imageUrl`. NUNCA `genotype`/`phenotype` (composição genética), `ownerId`
 * (dono), `sireId`/`damId` (pedigree/linhagem), `fPedigree`/`fixationIndex`
 * (métricas de criação), `cacheKey` cru, `fertility`/`haldaneStatus` ou
 * `status` (ALIVE/FROZEN). `imageUrl` só aparece se o retrato JÁ existe
 * (`stat()`, leitura pura) — esta rota NUNCA gera um retrato novo (não tem
 * como cobrar vaga/crédito de quem não está logado).
 *
 * Espécime inexistente → 404 (nunca 200 com campos vazios, nunca 403 —
 * mesma filosofia "escondido, sem cadeado" de `image.service.ts`, mas aqui
 * não há nada pra esconder por tier: o link só existe se o DONO decidiu
 * compartilhar este id específico).
 */
import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { resolveDisplayName } from "@genbreedai/shared";
import type { Sex } from "@genbreedai/shared";
import { SpecimenRepository } from "./in-memory.repository";
import { cacheKeyOf } from "../images/image.service";
import { stat, publicUrl } from "../images/storage";

export interface PublicSpecimenView {
  id: string;
  displayName: string;
  species: string;
  aura: number;
  sex: Sex | null;
  generation: number;
  imageUrl: string | null;
}

@Controller("api/v1/public/specimens")
export class PublicSpecimenController {
  constructor(private readonly repo: SpecimenRepository) {}

  @Get(":id")
  async get(@Param("id") id: string): Promise<PublicSpecimenView> {
    const s = await this.repo.get(id);
    if (!s) throw new NotFoundException(`Espécime ${id} não encontrado.`);

    // Leitura pura — NUNCA gera retrato aqui (rota sem login, sem como cobrar).
    const cacheKey = cacheKeyOf(s);
    const st = await stat(cacheKey);
    const imageUrl = st ? publicUrl(cacheKey, st.version) : null;

    return {
      id: s.id,
      displayName: resolveDisplayName(s.id, s.species),
      species: s.species,
      aura: s.aura,
      sex: s.sex,
      generation: s.generation,
      imageUrl,
    };
  }
}
