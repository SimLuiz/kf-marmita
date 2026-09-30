// Entrada e saída do sistema. O cookie de sessão é HttpOnly: o navegador nunca
// vê o token, só o manda de volta em cada chamada.
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SESSAO_EXPIRADA } from "./middleware";

const campoUsuario = z.string().trim().min(1).max(64);

// Quem está logado (null = mostrar a tela de login).
export const eu = createServerFn({ method: "GET" }).handler(async () => {
  const { verificarSessao } = await import("@/server/sessao");
  const u = await verificarSessao();
  return u ? { id: u.id, nome: u.nome, usuario: u.usuario, admin: u.admin } : null;
});

export const entrar = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        usuario: campoUsuario,
        senha: z.string().min(1).max(200),
        codigo: z.string().regex(/^\d{6}$/).optional(),
        turnstile: z.string().max(4096).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { entrar: fazerLogin } = await import("@/server/sessao");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const { resposta, cookie } = await fazerLogin(data);
    if (cookie) setResponseHeader("Set-Cookie", cookie);
    return resposta;
  });

export const confirmar2fa = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ usuario: campoUsuario, codigo: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { confirmar2FA } = await import("@/server/sessao");
    return confirmar2FA(data);
  });

export const sair = createServerFn({ method: "POST" }).handler(async () => {
  const { sair: fazerLogout } = await import("@/server/sessao");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Set-Cookie", await fazerLogout());
  return { ok: true };
});

// Middleware GLOBAL de cliente (registrado em start.ts): qualquer server
// function que responda "sessao_expirada" (sessão vencida por inatividade,
// usuário desativado, sessão encerrada pelo admin) derruba a tela para o login.
export const avisoSessaoExpirada = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    if (e instanceof Error && e.message === SESSAO_EXPIRADA && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("kf:sessao-expirada"));
    }
    throw e;
  }
});
