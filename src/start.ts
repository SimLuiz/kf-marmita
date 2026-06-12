import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const SUPABASE_HOST = "https://fumbcjoeylgizrzagnff.supabase.co";

// Content-Security-Policy + headers complementares (XSS / clickjacking / sniffing).
// IMPORTANTE: depois da migração HttpOnly, o browser não fala mais com o Supabase direto
// para auth/data. Mantemos connect-src ao Supabase apenas para downloads de signed URLs
// de storage (assinaturas) que rodam direto do browser.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${SUPABASE_HOST}`,
  `frame-ancestors 'self' https://*.lovable.app https://lovable.dev`,
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
    setResponseHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=(), payment=()",
    );
    setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  } catch {
    /* fora do contexto de request — ignora */
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
  // Sem attachSupabaseAuth: o browser não tem token; cookies HttpOnly carregam a sessão.
  functionMiddleware: [],
}));
