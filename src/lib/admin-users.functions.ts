// Usuários do sistema — só admin. Cada ação vai para logs_acesso como admin_*.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { soAdmin, exigirSenhaAdmin, falhaDoBanco } from "./middleware";

const uuid = z.string().uuid();
const nomeUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,32}$/, "Usuário inválido (3 a 32 letras minúsculas, números, ponto, hífen ou _)");
const senhaAdmin = z.string().min(1).max(200);

async function registrar(ctx: any, acao: string, alvo: string | null, detalhe?: string) {
  const { registrarAcesso } = await import("@/server/sessao");
  await registrarAcesso({
    usuario_id: ctx.usuario.id,
    usuario: ctx.usuario.usuario,
    acao,
    detalhe: [alvo ? `alvo: ${alvo}` : null, detalhe].filter(Boolean).join(" — ") || null,
  });
}

async function nomeDoAlvo(db: any, id: string): Promise<{ usuario: string; nome: string; admin: boolean } | null> {
  const { data } = await db.from("usuarios").select("usuario, nome, admin").eq("id", id).maybeSingle();
  return data ?? null;
}

// Desativar, resetar 2FA ou trocar senha derruba as sessões abertas do alvo.
async function encerrarSessoes(db: any, usuarioId: string) {
  await db.from("sessoes").update({ ativo: false }).eq("usuario_id", usuarioId).eq("ativo", true);
}

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([soAdmin])
  .handler(async ({ context: { db } }) => {
    const [{ data: usuarios, error }, { data: sessoes }] = await Promise.all([
      db
        .from("usuarios")
        .select("id, nome, usuario, admin, ativo, exige_2fa, totp_confirmado, criado_em, ultimo_acesso")
        .order("usuario"),
      db.from("sessoes").select("usuario_id").eq("ativo", true).gt("expira_em", new Date().toISOString()),
    ]);
    if (error) falhaDoBanco(error);
    const abertas = new Map<string, number>();
    for (const s of sessoes ?? []) abertas.set(s.usuario_id, (abertas.get(s.usuario_id) ?? 0) + 1);
    return (usuarios ?? []).map((u: any) => ({ ...u, sessoes_abertas: abertas.get(u.id) ?? 0 }));
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) =>
    z
      .object({
        nome: z.string().trim().min(2).max(80),
        usuario: nomeUsuario,
        senha: z.string().min(1).max(200),
        admin: z.boolean(),
        exige_2fa: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { problemaSenha, hashSenha } = await import("@/server/sessao");
    const problema = problemaSenha(data.senha, { usuario: data.usuario, nome: data.nome });
    if (problema) throw new Error(problema);
    const { error } = await context.db.from("usuarios").insert({
      nome: data.nome,
      usuario: data.usuario,
      senha_hash: await hashSenha(data.senha),
      admin: data.admin,
      exige_2fa: data.admin || data.exige_2fa,
    });
    if (error) { if (error.code === "23505") throw new Error("Já existe um usuário com esse nome"); falhaDoBanco(error); }
    await registrar(context, "admin_usuario_criado", data.usuario, data.admin ? "administrador" : undefined);
    return { ok: true };
  });

export const alterarSenhaDeUsuario = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    const { problemaSenha, hashSenha } = await import("@/server/sessao");
    const problema = problemaSenha(data.senha, alvo);
    if (problema) throw new Error(problema);
    const { error } = await context.db.from("usuarios").update({ senha_hash: await hashSenha(data.senha) }).eq("id", data.id);
    if (error) falhaDoBanco(error);
    if (data.id !== context.usuario.id) await encerrarSessoes(context.db, data.id);
    await registrar(context, "admin_senha_alterada", alvo.usuario);
    return { ok: true };
  });

// Só o ADMIN troca a própria senha por aqui (confirmando a atual). Decisão do
// usuário (30/09): usuário comum NÃO troca a própria senha — escolheria senha
// fácil. A senha dele é definida pelo admin na tela Usuários
// (alterarSenhaDeUsuario). O botão some da tela para quem não é admin, e esta
// barreira no servidor vale para quem chamar a função direto.
export const trocarMinhaSenha = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ atual: z.string().min(1).max(200), nova: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    const { problemaSenha, hashSenha } = await import("@/server/sessao");
    const { data: eu } = await context.db.from("usuarios").select("senha_hash").eq("id", context.usuario.id).single();
    const { data: ok } = await context.db.rpc("verificar_senha", { senha: data.atual, hash: eu.senha_hash });
    if (ok !== true) throw new Error("Senha atual incorreta");
    const problema = problemaSenha(data.nova, context.usuario);
    if (problema) throw new Error(problema);
    await context.db.from("usuarios").update({ senha_hash: await hashSenha(data.nova) }).eq("id", context.usuario.id);
    await registrar(context, "senha_trocada", null);
    return { ok: true };
  });

export const definirAtivo = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, ativo: z.boolean(), senha: senhaAdmin }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    if (data.id === context.usuario.id && !data.ativo) throw new Error("Você não pode desativar a si mesmo");
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    await context.db.from("usuarios").update({ ativo: data.ativo }).eq("id", data.id);
    if (!data.ativo) await encerrarSessoes(context.db, data.id);
    await registrar(context, data.ativo ? "admin_usuario_reativado" : "admin_usuario_desativado", alvo.usuario);
    return { ok: true };
  });

// Excluir só quem nunca registrou nada: a chave estrangeira (ON DELETE
// RESTRICT, migration 001) recusa quem tem lançamento ou cadastro — antes era
// CASCADE e excluir o usuário apagava tudo o que ele tinha lançado.
export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: senhaAdmin }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    if (data.id === context.usuario.id) throw new Error("Você não pode excluir a si mesmo");
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    const { error } = await context.db.from("usuarios").delete().eq("id", data.id);
    if (error) {
      if (error.code === "23503") throw new Error("Este usuário já registrou lançamentos ou cadastros. Desative em vez de excluir.");
      falhaDoBanco(error);
    }
    await registrar(context, "admin_usuario_excluido", alvo.usuario);
    return { ok: true };
  });

export const resetar2fa = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    await context.db
      .from("usuarios")
      .update({ totp_secret: null, totp_confirmado: false, totp_ultimo_uso: null })
      .eq("id", data.id);
    await encerrarSessoes(context.db, data.id);
    await registrar(context, "2fa_resetado", alvo.usuario);
    return { ok: true };
  });

// Liga/desliga o 2FA de um usuário comum. Admin sempre tem 2FA.
export const definirExige2fa = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, exige: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    if (alvo.admin && !data.exige) throw new Error("Administrador sempre usa verificação em duas etapas");
    await context.db.from("usuarios").update({ exige_2fa: data.exige }).eq("id", data.id);
    await registrar(context, data.exige ? "2fa_ligado" : "2fa_desligado", alvo.usuario);
    return { ok: true };
  });

export const definirAdmin = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, admin: z.boolean(), senha: senhaAdmin }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    if (data.id === context.usuario.id && !data.admin) throw new Error("Você não pode tirar o próprio acesso de administrador");
    const alvo = await nomeDoAlvo(context.db, data.id);
    if (!alvo) throw new Error("Usuário não encontrado");
    await context.db
      .from("usuarios")
      .update({ admin: data.admin, ...(data.admin ? { exige_2fa: true } : {}) })
      .eq("id", data.id);
    await encerrarSessoes(context.db, data.id);
    await registrar(context, data.admin ? "admin_promovido" : "admin_rebaixado", alvo.usuario);
    return { ok: true };
  });
