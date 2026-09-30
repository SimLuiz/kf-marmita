// Middlewares das server functions — a ÚNICA porta para o banco.
//
// `comSessao`: confere o cookie de sessão e entrega `usuario` + `db` (cliente
// do banco já com o autor nos cabeçalhos da auditoria). Sem sessão válida,
// lança "sessao_expirada" — o middleware de cliente de `avisoSessaoExpirada`
// transforma isso em volta para a tela de login.
// `soAdmin`: o mesmo, e recusa quem não é admin.
//
// ⚠️ O que roda no servidor é importado DENTRO de `.server()`: o que fica no
// topo deste arquivo vai também para o navegador.
import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import type { Usuario } from "@/server/sessao";

export const SESSAO_EXPIRADA = "sessao_expirada";

// Erro do banco NÃO vai cru para a tela: a mensagem do PostgREST traz nome de
// tabela, coluna e restrição. O detalhe fica no log do Worker (observability).
export function falhaDoBanco(error: any): never {
  console.error("[banco]", error?.code, error?.message, error?.details);
  throw new Error("Não foi possível salvar/consultar os dados. Tente de novo.");
}
export const SO_ADMIN = "Acesso negado: somente admin";

export const comSessao = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { verificarSessao, ipDoPedido } = await import("@/server/sessao");
  const { banco } = await import("@/server/banco");
  const usuario = await verificarSessao();
  if (!usuario) throw new Error(SESSAO_EXPIRADA);
  return next({ context: { usuario, db: banco(usuario.id, ipDoPedido()) } });
});

export const soAdmin = createMiddleware({ type: "function" })
  .middleware([comSessao])
  .server(async ({ next, context }) => {
    if (!context.usuario.admin) throw new Error(SO_ADMIN);
    return next();
  });

// Permissões configuráveis (tela Permissões). Admin pode tudo.
export type ChavePermissao =
  | "can_create_employees"
  | "can_edit_employees"
  | "can_manage_suppliers"
  | "can_edit_records"
  | "can_backdate_records";

// ⚠️ `createServerOnlyFn`: estas funções só existem no servidor. Sem o
// invólucro, a importação de @/server/sessao ficaria no código do navegador e
// a proteção de importação (vite.config.ts) barra a página inteira em `dev`.
export const temPermissao = createServerOnlyFn(
  async (ctx: { usuario: Usuario; db: any }, chave: ChavePermissao): Promise<boolean> => {
    if (ctx.usuario.admin) return true;
    const { data } = await ctx.db.from("app_permissions").select(chave).limit(1).maybeSingle();
    return !!data?.[chave];
  },
);

export const exigirPermissao = createServerOnlyFn(async (ctx: { usuario: Usuario; db: any }, chave: ChavePermissao) => {
  if (!(await temPermissao(ctx, chave))) throw new Error("Você não tem permissão para esta ação");
});

// Ações destrutivas pedem a senha de quem está logado (admin), conferida aqui.
export const exigirSenhaAdmin = createServerOnlyFn(async (usuario: Usuario, senha: string) => {
  const { conferirSenhaDoAdmin } = await import("@/server/sessao");
  if (!(await conferirSenhaDoAdmin(usuario, senha))) throw new Error("Senha incorreta");
});
