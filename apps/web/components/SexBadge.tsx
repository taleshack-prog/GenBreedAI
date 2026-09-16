/** Símbolo ♂/♀ com aria-label, reusado onde um espécime mostra seu sexo. */
export function sexChar(sex: "M" | "F" | null | undefined): string {
  if (sex === "M") return "♂";
  if (sex === "F") return "♀";
  return "";
}

export function SexBadge({ sex, className = "ml-2 align-middle" }: { sex: "M" | "F" | null | undefined; className?: string }) {
  if (sex === "M") return <span aria-label="Macho" className={className}>♂</span>;
  if (sex === "F") return <span aria-label="Fêmea" className={className}>♀</span>;
  return null;
}
