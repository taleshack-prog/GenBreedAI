/** ImageJob (TDD §3): auditoria de geração/moderação. In-memory (Drizzle = próximo). */
import { Injectable } from "@nestjs/common";
import type { ModerationStatus } from "./moderation";
export interface ImageJob {
  cacheKey: string; specimenId: string; tier: string; model: string;
  resolution: string; status: "APPROVED" | "REJECTED" | "PENDING";
  moderationStatus: ModerationStatus; imageUrl: string | null;
}
@Injectable()
export class ImageJobRepository {
  private readonly jobs = new Map<string, ImageJob>();
  get(cacheKey: string): ImageJob | undefined { return this.jobs.get(cacheKey); }
  save(job: ImageJob): ImageJob { this.jobs.set(job.cacheKey, job); return job; }
}
