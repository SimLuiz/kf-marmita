import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, RefreshCw, HardDrive, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getDbStorage, type DbStorage } from "@/lib/db-storage.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/armazenamento")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const fetchStorage = useServerFn(getDbStorage);
  const [data, setData] = useState<DbStorage | null>(null);
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
      setData((await fetchStorage()) as DbStorage);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Falha ao carregar"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return null;

  const pct = data ? Math.min(100, (data.db_bytes / data.soft_limit_bytes) * 100) : 0;
  const tone =
    pct >= 90
      ? { bar: "bg-destructive", text: "text-destructive", label: "Crítico" }
      : pct >= 70
        ? { bar: "bg-amber-500", text: "text-amber-600", label: "Atenção" }
        : { bar: "bg-emerald-500", text: "text-emerald-600", label: "Saudável" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="h-6 w-6 text-primary" />
            Armazenamento
          </h1>
          <p className="text-xs text-muted-foreground">
            Uso do banco de dados · limite de referência 500 MB
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Recarregar">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {data && (
        <>
          <div
            className="rounded-xl border bg-card p-4 space-y-3"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pct >= 70 ? (
                  <AlertTriangle className={`h-4 w-4 ${tone.text}`} />
                ) : (
                  <CheckCircle2 className={`h-4 w-4 ${tone.text}`} />
                )}
                <span className={`text-sm font-semibold ${tone.text}`}>{tone.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {pct.toFixed(1)}% usado
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${tone.bar} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{fmtBytes(data.db_bytes)}</span>
              <span className="text-muted-foreground">
                de {fmtBytes(data.soft_limit_bytes)}
              </span>
            </div>
            {pct >= 90 && (
              <p className="text-xs text-destructive">
                O banco está próximo do limite. Considere revisar registros antigos ou aumentar o plano.
              </p>
            )}
          </div>

          <div
            className="rounded-xl border bg-card p-4"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Tabelas (maiores primeiro)
            </p>
            {data.tables.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma tabela encontrada.</p>
            )}
            <div className="space-y-2">
              {data.tables.map((t) => {
                const p = data.db_bytes ? (t.total_bytes / data.db_bytes) * 100 : 0;
                return (
                  <div key={t.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{t.name}</span>
                      <span className="text-muted-foreground">
                        {fmtBytes(t.total_bytes)} · ~{t.row_estimate.toLocaleString("pt-BR")} linhas
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: `${Math.min(100, p)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
          </p>
        </>
      )}
    </div>
  );
}
