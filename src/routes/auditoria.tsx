import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import { listAuditLogs } from "@/lib/audit.functions";

export const Route = createFileRoute("/auditoria")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

interface LogRow {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
  LOGIN: "Login",
  LOGOUT: "Logout",
  PASSWORD_RESET: "Reset senha",
  ADMIN_PASSWORD_RESET: "Reset senha (admin)",
  USER_CREATED: "Usuário criado",
  USER_DELETED: "Usuário excluído",
};

const ACTION_TONE: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DELETE: "bg-destructive/15 text-destructive",
  USER_DELETED: "bg-destructive/15 text-destructive",
  LOGIN: "bg-primary/15 text-primary",
  LOGOUT: "bg-muted text-muted-foreground",
  PASSWORD_RESET: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ADMIN_PASSWORD_RESET: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  USER_CREATED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listAuditLogs);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Acesso restrito ao administrador");
      navigate({ to: "/" });
    }
  }, [loading, isAdmin, navigate]);

  const load = async () => {
    setBusy(true);
    try {
      const data = (await listFn()) as LogRow[];
      setLogs(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      [l.action, l.table_name, l.username, l.ip_address, l.record_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [logs, query]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Auditoria
          </h1>
          <p className="text-xs text-muted-foreground">
            Últimos 500 eventos. Visível somente para administradores.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Recarregar">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Input
        placeholder="Filtrar por usuário, ação, IP, tabela..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {busy ? "Carregando..." : "Nenhum registro."}
          </p>
        )}
        {filtered.map((l) => {
          const isOpen = !!expanded[l.id];
          const hasData = l.old_data || l.new_data;
          return (
            <div
              key={l.id}
              className="rounded-xl border bg-card p-3 text-sm"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${ACTION_TONE[l.action] ?? "bg-muted"} border-0`}>
                      {ACTION_LABEL[l.action] ?? l.action}
                    </Badge>
                    {l.table_name && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {l.table_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{l.username ?? "—"}</span>
                    {" · "}
                    {fmt(l.created_at)}
                    {l.ip_address && <> · IP {l.ip_address}</>}
                  </div>
                  {l.record_id && (
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      id: {l.record_id}
                    </div>
                  )}
                </div>
                {hasData && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpanded((s) => ({ ...s, [l.id]: !isOpen }))}
                    aria-label="Detalhes"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {isOpen && hasData && (
                <div className="mt-3 grid sm:grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Antes
                    </p>
                    <pre className="text-[11px] bg-muted/60 rounded p-2 overflow-auto max-h-64">
                      {l.old_data ? (JSON.stringify(l.old_data, null, 2) as string) : "—"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Depois
                    </p>
                    <pre className="text-[11px] bg-muted/60 rounded p-2 overflow-auto max-h-64">
                      {l.new_data ? JSON.stringify(l.new_data, null, 2) : "—"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
