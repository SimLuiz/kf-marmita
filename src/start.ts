import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { avisoSessaoExpirada } from "@/lib/sessao.functions";

// Desde a migration 002 o navegador não fala mais com o Supabase: o banco só é
// acessado pelo Worker. O que sobra de domínio externo é o Turnstile (script +
// iframe do anti-robô). A fonte é servida daqui. As assinaturas abrem por URL assinada
// do Storage (img-src https:).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  // Storage: o Excel baixa as assinaturas pelas URLs assinadas.
  `connect-src 'self' https://uryjwyjswumyqhyqecjn.supabase.co`,
  `frame-src https://challenges.cloudflare.com`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const securityHeaders = createMiddleware({ type: "request" }).server(async ({ next }) => {
  try {
    setResponseHeader("Content-Security-Policy", CSP);
    setResponseHeader("X-Content-Type-Options", "nosniff");
    setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    setResponseHeader("X-Frame-Options", "SAMEORIGIN");
    setResponseHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  } catch {
    /* noop */
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
  functionMiddleware: [avisoSessaoExpirada],
}));
