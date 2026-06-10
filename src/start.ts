import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SUPABASE_HOST = "https://fumbcjoeylgizrzagnff.supabase.co";
const SUPABASE_WS = "wss://fumbcjoeylgizrzagnff.supabase.co";

// Content-Security-Policy + headers complementares (XSS / clickjacking / sniffing)
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' necessário para o estado de hidratação inline do TanStack Start
  `script-src 'self' 'unsafe-inline'`,
  // Tailwind/shadcn usam estilos inline e <style> dinâmicos
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WS}`,
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
  functionMiddleware: [attachSupabaseAuth],
}));
