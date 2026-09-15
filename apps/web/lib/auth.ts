/** Sessão do usuário no cliente (JWT em localStorage). Substitui o modo demo. */
export interface SessionUser { id: string; email: string | null; name: string | null; tier: string; }

const TOKEN_KEY = "gb:token";
const USER_KEY = "gb:user";
// O JWT mora só em localStorage (nunca em cookie) — middleware.ts roda no
// edge e não enxerga localStorage, então mantemos este cookie SEM o token,
// só como sinalizador de "tem sessão", pra decidir redirecionamentos de
// rota (/ → /app; /app sem sessão → /login). Nunca usado pra autorizar nada.
const SESSION_FLAG_COOKIE = "gb_session";

function setSessionCookie() {
  document.cookie = `${SESSION_FLAG_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}
function clearSessionCookie() {
  document.cookie = `${SESSION_FLAG_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}
export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setSessionCookie();
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearSessionCookie();
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Falha na autenticação.");
  return data as { token: string; user: SessionUser };
}

export async function register(email: string, password: string, name?: string) {
  const r = await post("/api/v1/auth/register", { email, password, name });
  setSession(r.token, r.user);
  return r;
}
export async function login(email: string, password: string) {
  const r = await post("/api/v1/auth/login", { email, password });
  setSession(r.token, r.user);
  return r;
}
export async function loginWithGoogle(idToken: string) {
  const r = await post("/api/v1/auth/google", { idToken });
  setSession(r.token, r.user);
  return r;
}
