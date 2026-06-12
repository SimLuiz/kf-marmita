import { createServerFn } from "@tanstack/react-start";

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

const CRITICAL_ACTIONS = new Set([
  "DELETE",
  "USER_DELETED",
  "USER_CREATED",
  "ADMIN_PASSWORD_RESET",
  "PASSWORD_RESET",
]);

export const getSecurityMetrics = createServerFn({ method: "GET" }).handler(
  async (): Promise<SecurityMetrics> => {
    const { requireServerSession, assertAdmin } = await import(
      "@/integrations/supabase/session.server"
    );
    const s = await requireServerSession();
    await assertAdmin(s);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: rows24h } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, username, user_id, table_name, ip_address, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(2000);

    const all = rows24h ?? [];
    const logins24h = all.filter((r) => r.action === "LOGIN").length;
    const loginsFailed24h = all.filter((r) => r.action === "LOGIN_FAILED").length;
    const deletions24h = all.filter(
      (r) => r.action === "DELETE" || r.action === "USER_DELETED",
    ).length;
    const criticalActions24h = all.filter((r) => CRITICAL_ACTIONS.has(r.action)).length;

    const activeSessions = new Set(
      all.filter((r) => r.user_id && r.created_at >= since5m).map((r) => r.user_id),
    ).size;

    const ipCounts = new Map<string, number>();
    for (const r of all) {
      if (!r.ip_address) continue;
      ipCounts.set(r.ip_address, (ipCounts.get(r.ip_address) ?? 0) + 1);
    }
    const topIps = [...ipCounts.entries()]
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const alerts: SecurityAlert[] = [];

    const failedByUser = new Map<string, number>();
    for (const r of all) {
      if (r.action !== "LOGIN_FAILED" || r.created_at < since1h) continue;
      const k = r.username ?? "(desconhecido)";
      failedByUser.set(k, (failedByUser.get(k) ?? 0) + 1);
    }
    for (const [user, count] of failedByUser) {
      if (count >= 5) {
        alerts.push({
          level: "critical",
          title: "Possível brute-force",
          detail: `${count} tentativas falhas para "${user}" na última hora.`,
        });
      }
    }

    const delsLastHour = all.filter(
      (r) => (r.action === "DELETE" || r.action === "USER_DELETED") && r.created_at >= since1h,
    ).length;
    if (delsLastHour >= 5) {
      alerts.push({
        level: "critical",
        title: "Excesso de exclusões",
        detail: `${delsLastHour} exclusões na última hora.`,
      });
    }

    const ipsByUser = new Map<string, Set<string>>();
    for (const r of all) {
      if (r.action !== "LOGIN" || !r.username || !r.ip_address) continue;
      if (!ipsByUser.has(r.username)) ipsByUser.set(r.username, new Set());
      ipsByUser.get(r.username)!.add(r.ip_address);
    }
    for (const [user, ips] of ipsByUser) {
      if (ips.size >= 3) {
        alerts.push({
          level: "warning",
          title: "Acessos de múltiplos IPs",
          detail: `"${user}" logou de ${ips.size} IPs diferentes nas últimas 24h.`,
        });
      }
    }

    const loginsByUserLastHour = new Map<string, number>();
    for (const r of all) {
      if (r.action !== "LOGIN" || !r.username || r.created_at < since1h) continue;
      loginsByUserLastHour.set(r.username, (loginsByUserLastHour.get(r.username) ?? 0) + 1);
    }
    for (const [user, count] of loginsByUserLastHour) {
      if (count >= 10) {
        alerts.push({
          level: "warning",
          title: "Logins em excesso",
          detail: `"${user}" efetuou ${count} logins na última hora.`,
        });
      }
    }

    const recentCritical = all
      .filter((r) => CRITICAL_ACTIONS.has(r.action))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        action: r.action,
        username: r.username,
        table_name: r.table_name,
        ip_address: r.ip_address,
        created_at: r.created_at,
      }));

    return {
      activeSessions,
      logins24h,
      loginsFailed24h,
      deletions24h,
      criticalActions24h,
      topIps,
      alerts,
      recentCritical,
    };
  },
);
