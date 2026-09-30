// Painel de Segurança. Desde o login no padrão KF, entrada/saída/falha ficam
// em `logs_acesso` (não mais em audit_logs); exclusões de dado continuam em
// audit_logs (gatilho). O formato devolvido é o mesmo que a tela já usava.
import { createServerFn } from "@tanstack/react-start";
import { soAdmin } from "./middleware";

export interface SecurityAlert {
  level: "warning" | "critical";
  title: string;
  detail: string;
}

export interface SecurityMetrics {
  activeSessions: number;
  logins24h: number;
  loginsFailed24h: number;
  deletions24h: number;
  criticalActions24h: number;
  topIps: { ip: string; count: number }[];
  alerts: SecurityAlert[];
  recentCritical: {
    id: string;
    action: string;
    username: string | null;
    table_name: string | null;
    ip_address: string | null;
    created_at: string;
  }[];
}

// Ações de logs_acesso que contam como críticas.
const ACESSO_CRITICO = new Set([
  "login_bloqueado",
  "2fa_resetado",
  "2fa_desligado",
  "admin_usuario_criado",
  "admin_usuario_excluido",
  "admin_usuario_desativado",
  "admin_senha_alterada",
  "admin_promovido",
  "admin_rebaixado",
]);

export const getSecurityMetrics = createServerFn({ method: "GET" })
  .middleware([soAdmin])
  .handler(async ({ context: { db } }): Promise<SecurityMetrics> => {
    const agora = Date.now();
    const desde24h = new Date(agora - 24 * 3600 * 1000).toISOString();
    const desde1h = new Date(agora - 3600 * 1000).toISOString();

    const [{ data: acessos }, { data: exclusoes }, { count: sessoes }] = await Promise.all([
      db
        .from("logs_acesso")
        .select("id, usuario, ip, acao, detalhe, criado_em")
        .gte("criado_em", desde24h)
        .order("criado_em", { ascending: false })
        .limit(5000),
      db
        .from("audit_logs")
        .select("id, action, username, table_name, ip_address, created_at")
        .eq("action", "DELETE")
        .gte("created_at", desde24h)
        .order("created_at", { ascending: false })
        .limit(2000),
      db
        .from("sessoes")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .gt("expira_em", new Date(agora).toISOString())
        .gt("ultima_atividade", new Date(agora - 60 * 60 * 1000).toISOString()),
    ]);
    const a = (acessos ?? []) as any[];
    const d = (exclusoes ?? []) as any[];

    const logins24h = a.filter((r) => r.acao === "login_ok").length;
    const loginsFailed24h = a.filter((r) => r.acao === "login_falha").length;
    const criticos = a.filter((r) => ACESSO_CRITICO.has(r.acao));

    const porIp = new Map<string, number>();
    for (const r of a) if (r.ip) porIp.set(r.ip, (porIp.get(r.ip) ?? 0) + 1);
    const topIps = [...porIp.entries()]
      .map(([ip, count]) => ({ ip, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    const alerts: SecurityAlert[] = [];
    const falhasPorUsuario = new Map<string, number>();
    for (const r of a) {
      if (r.acao !== "login_falha" || r.criado_em < desde1h) continue;
      const k = r.usuario ?? "(desconhecido)";
      falhasPorUsuario.set(k, (falhasPorUsuario.get(k) ?? 0) + 1);
    }
    for (const [u, n] of falhasPorUsuario) {
      if (n >= 5) alerts.push({ level: "critical", title: "Possível ataque de senha", detail: `${n} tentativas falhas para "${u}" na última hora.` });
    }
    const bloqueios = a.filter((r) => r.acao === "login_bloqueado").length;
    if (bloqueios > 0) {
      alerts.push({ level: "critical", title: "IP bloqueado", detail: `${bloqueios} bloqueio(s) por excesso de tentativas nas últimas 24h.` });
    }
    const exclusoesUltimaHora = d.filter((r) => r.created_at >= desde1h).length;
    if (exclusoesUltimaHora >= 5) {
      alerts.push({ level: "critical", title: "Excesso de exclusões", detail: `${exclusoesUltimaHora} exclusões na última hora.` });
    }
    const ipsPorUsuario = new Map<string, Set<string>>();
    for (const r of a) {
      if (r.acao !== "login_ok" || !r.usuario || !r.ip) continue;
      if (!ipsPorUsuario.has(r.usuario)) ipsPorUsuario.set(r.usuario, new Set());
      ipsPorUsuario.get(r.usuario)!.add(r.ip);
    }
    for (const [u, ips] of ipsPorUsuario) {
      if (ips.size >= 3) alerts.push({ level: "warning", title: "Acessos de vários IPs", detail: `"${u}" entrou de ${ips.size} IPs diferentes nas últimas 24h.` });
    }

    const recentCritical = [
      ...criticos.map((r) => ({
        id: `acesso-${r.id}`,
        action: r.acao,
        username: r.usuario,
        table_name: r.detalhe,
        ip_address: r.ip,
        created_at: r.criado_em,
      })),
      ...d.map((r) => ({
        id: r.id,
        action: r.action,
        username: r.username,
        table_name: r.table_name,
        ip_address: r.ip_address,
        created_at: r.created_at,
      })),
    ]
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
      .slice(0, 20);

    return {
      activeSessions: sessoes ?? 0,
      logins24h,
      loginsFailed24h,
      deletions24h: d.length,
      criticalActions24h: criticos.length + d.length,
      topIps,
      alerts,
      recentCritical,
    };
  });
