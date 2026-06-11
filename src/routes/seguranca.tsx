import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Activity,
  LogIn,
  XCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { getSecurityMetrics, type SecurityMetrics } from "@/lib/security-metrics.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/seguranca")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

const ACTION_LABEL: Record<string, string> = {
  DELETE: "Exclusão",
  USER_CREATED: "Usuário criado",
  USER_DELETED: "Usuário excluído",
  PASSWORD_RESET: "Reset senha",
  ADMIN_PASSWORD_RESET: "Reset senha (admin)",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} />
        {label}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const fetchMetrics = useServerFn(getSecurityMetrics);
  const [data, setData] = useState<SecurityMetrics | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Acesso restrito ao administrador");
      navigate({ to: "/" });
    }
  }, [loading, isAdmin, navigate]);

  const load = async () => {
    setBusy(true);
    try {
      setData((await fetchMetrics()) as SecurityMetrics);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Falha ao carregar"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    const id = window.setInterval(() => {
      if (isAdmin) load();
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Segurança
          </h1>
          <p className="text-xs text-muted-foreground">
            Monitoramento em tempo real · atualiza a cada 30s
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Recarregar">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Alertas */}
      {data && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                a.level === "critical"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              {a.level === "critical" ? (
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs opacity-90">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.alerts.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          Nenhuma atividade suspeita nas últimas 24h.
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={Activity} label="Sessões ativas (5min)" value={data?.activeSessions ?? "—"} />
        <MetricCard icon={LogIn} label="Logins (24h)" value={data?.logins24h ?? "—"} />
        <MetricCard
          icon={XCircle}
          label="Logins falhos (24h)"
          value={data?.loginsFailed24h ?? "—"}
          tone="text-destructive"
        />
        <MetricCard
          icon={Trash2}
          label="Exclusões (24h)"
          value={data?.deletions24h ?? "—"}
          tone="text-amber-600"
        />
      </div>

      {/* Top IPs */}
      {data && data.topIps.length > 0 && (
        <div className="rounded-xl border bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <p className="text-sm font-semibold mb-2">IPs mais ativos (24h)</p>
          <div className="space-y-1">
            {data.topIps.map((t) => (
              <div key={t.ip} className="flex justify-between text-xs">
                <span className="font-mono">{t.ip}</span>
                <span className="text-muted-foreground">{t.count} eventos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações críticas recentes */}
      <div className="rounded-xl border bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
        <p className="text-sm font-semibold mb-3">Ações críticas recentes</p>
        {data && data.recentCritical.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma nas últimas 24h.</p>
        )}
        <div className="space-y-2">
          {data?.recentCritical.map((r) => (
            <div key={r.id} className="text-xs flex items-center justify-between gap-2">
              <div className="min-w-0">
                <Badge variant="outline" className="mr-2">
                  {ACTION_LABEL[r.action] ?? r.action}
                </Badge>
                <span className="font-medium">{r.username ?? "—"}</span>
                {r.table_name && (
                  <span className="text-muted-foreground"> · {r.table_name}</span>
                )}
              </div>
              <span className="text-muted-foreground shrink-0">{fmt(r.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
