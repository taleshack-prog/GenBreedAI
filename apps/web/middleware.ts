import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Redireciona por sessão. A sessão real (JWT) mora em localStorage — o
 * middleware roda no edge e não a enxerga — então lemos só o cookie
 * `gb_session` (sinalizador sem o token, setado/limpo em lib/auth.ts). Ele
 * nunca autoriza nada; cada rota da API valida o JWT de verdade.
 *
 *  - /       + sessão → /app (usuário já logado não precisa ver a landing).
 *  - /app/*  sem sessão → /login.
 */
const SESSION_COOKIE = "gb_session";

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;

  if (pathname === "/" && hasSession) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  if (pathname.startsWith("/app") && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*"],
};
