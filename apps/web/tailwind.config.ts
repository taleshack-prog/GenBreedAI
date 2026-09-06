import type { Config } from "tailwindcss";

/**
 * Design System "Cyber-Genetics" (docs/Design_System.md §2). Hex EXATOS do brief —
 * nada é inventado aqui. Ciano = progenitor A, púrpura = progenitor B.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          900: "#050A0F", // fundo primário
          800: "#0B1420", // painéis
          700: "#0F1C2E", // painel elevado (derivado)
          studio: "#0A0E14", // fundo de estúdio dos animais
        },
        cyan: { DEFAULT: "#00F0FF", 600: "#0A84FF" }, // progenitor A / inventário
        purple: { DEFAULT: "#BF00FF" }, // progenitor B / laboratório
        ok: { DEFAULT: "#00FF9D" }, // status concluído / saudável
        warn: { DEFAULT: "#FFC107" }, // depressão endogâmica (F > 0.15)
        crit: { DEFAULT: "#FF3B5C" }, // crítico (F > 0.20)
        star: { DEFAULT: "#F5C542" }, // raridade
        ink: { DEFAULT: "#FFFFFF", muted: "#9E9E9E" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { card: "16px" },
      boxShadow: {
        "neon-cyan": "0 0 12px rgba(0,240,255,0.6), inset 0 0 8px rgba(0,240,255,0.2)",
        "neon-purple": "0 0 12px rgba(191,0,255,0.6), inset 0 0 8px rgba(191,0,255,0.2)",
        "neon-green": "0 0 10px rgba(0,255,157,0.5)",
        "neon-red": "0 0 12px rgba(255,59,92,0.55), inset 0 0 8px rgba(255,59,92,0.2)",
        "neon-amber": "0 0 12px rgba(255,193,7,0.5), inset 0 0 8px rgba(255,193,7,0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
