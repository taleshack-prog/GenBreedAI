import { describe, it, expect } from "vitest";
import { familyVisibleAtTier } from "../src/common/tier-access";

describe("Visibilidade por tier (esconder cães do Free)", () => {
  it("FREE vê felinos, NÃO vê caninos", () => {
    expect(familyVisibleAtTier("FREE", "feline")).toBe(true);
    expect(familyVisibleAtTier("FREE", "canine")).toBe(false);
  });
  it("SENIOR vê caninos", () => {
    expect(familyVisibleAtTier("SENIOR", "canine")).toBe(true);
  });
});
