/** Auras 1–5 (TDD §4.3). Estrelas em ouro — o único acento quente do tema. */
export function AuraStars({ value, size = 18 }: { value: number; size?: number }) {
  const label = `Aura ${value} de 5`;
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={i <= value ? "text-aura-400" : "text-base-500"}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.1-6.47L2.6 9.85l6.5-.95L12 2.5z" />
        </svg>
      ))}
    </div>
  );
}
