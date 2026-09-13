/** @type {import('next').NextConfig} */
// Produção aponta para a API pública do Railway por PADRÃO (não depende de env no Vercel).
// Dev usa localhost. Pode sobrescrever com API_URL se precisar.
const API =
  process.env.API_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://genbreedaiapi-production.up.railway.app"
    : "http://localhost:3001");

const nextConfig = {
  reactStrictMode: true,
  // O motor e os tipos são pacotes do workspace (TS puro) → transpilar.
  transpilePackages: ["@genbreedai/engine", "@genbreedai/shared"],
  // Proxy same-origin: o browser chama /api/v1/* e o Next repassa à API (sem CORS).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};
export default nextConfig;
