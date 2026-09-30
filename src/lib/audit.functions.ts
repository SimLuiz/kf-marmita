// Trilhas para o admin: alterações de dado (audit_logs, gravado pelo gatilho
// do banco) e acessos (logs_acesso: entrada, saída, falha, ações de admin).
// O navegador não grava mais nada aqui — quem registra é o servidor.
import { createServerFn } from "@tanstack/react-start";
import { soAdmin, falhaDoBanco } from "./middleware";

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([soAdmin])
  .handler(async ({ context: { db } }) => {
    const { data, error } = await db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) falhaDoBanco(error);
    return data ?? [];
  });

export const listarAcessos = createServerFn({ method: "GET" })
  .middleware([soAdmin])
  .handler(async ({ context: { db } }) => {
    const { data, error } = await db
      .from("logs_acesso")
      .select("id, usuario, ip, acao, detalhe, criado_em")
      .order("criado_em", { ascending: false })
      .limit(300);
    if (error) falhaDoBanco(error);
    return data ?? [];
  });
