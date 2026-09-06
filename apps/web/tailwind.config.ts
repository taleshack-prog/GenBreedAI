import type { Config } from "tailwindcss";

/**
 * Sistema de design — "laboratório genético em tons frios".
 * Base slate-azulada profunda (não preto puro), dados em ciano/teal,
 * QTL em violeta frio, e o ÚNICO acento quente reservado às auras (âmbar/ouro),
 * que são literalmente estrelas — gastamos a ousadia num único lugar.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          900: "#0b111c", // fundo mais profundo
          800: "#0f1626", // fundo
          700: "#141d30", // painel
          600: "#1b273f", // painel elevado
          500: "#26344f", // borda/realce
        },
        ink: {
          100: "#eaf1fb", // texto primário
          300: "#aec0d8", // texto secundário
          500: "#6f849f", // texto terciário / labels
        },
        gene: {
          400: "#57d6c4", // teal — loci/dados
          600: "#2fb6a6",
        },
        qtl: {
          400: "#9d8cff", // violeta frio — QTLs
        },
        aura: {
          400: "#f2c14e", // ouro — SOMENTE estrelas/auras
        },
        danger: { 400: "#f2777a" }, // letal/inviável
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 30px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
export default config;
