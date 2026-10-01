import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Database, RefreshCw, HardDrive, AlertTriangle, CheckCircle2, Trash2, Eye } from "lucide-react";
import { getDbStorage, type DbStorage } from "@/lib/db-storage.functions";
import {
  previewPurge,
  executePurge,
  type PurgeTarget,
} from "@/lib/db-purge.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/armazenamento")({
  head: () => ({
    meta: [
      { title: "Armazenamento | KF Marmita" },
      { name: "description", content: "Monitore o espaço usado por registros e assinaturas e limpe dados antigos." },
      { property: "og:title", content: "Armazenamento | KF Marmita" },
      { property: "og:description", content: "Monitore o espaço usado por registros e assinaturas e limpe dados antigos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

// Data LOCAL (Brasília) em AAAA-MM-DD. toISOString() dá a data em UTC: depois
// das 21h ela já é "amanhã".
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const fetchStorage = useServerFn(getDbStorage);
  const doPreview = useServerFn(previewPurge);
  const doExecute = useServerFn(executePurge);
  const [data, setData] = useState<DbStorage | null>(null);
  const [busy, setBusy] = useState(false);

  // Purge state
  const today = diaLocal(new Date());
  const monthAgo = diaLocal(new Date(Date.now() - 30 * 86400_000));
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [targets, setTargets] = useState<Record<PurgeTarget, boolean>>({
    meal_records: false,
    audit_logs: true,
    logs_acesso: false,
  });
  const [preview, setPreview] = useState<
    { target: PurgeTarget; label: string; count: number }[] | null
  >(null);
  const [previewing, setPreviewing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selectedTargets = useMemo(
    () => (Object.keys(targets) as PurgeTarget[]).filter((k) => targets[k]),
    [targets],
  );

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
          <p className="text-xs text-muted-foreground">
            Uso do disco do banco de dados · capacidade 2 GB
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Recarregar">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {data && (
        <>
          <div
            className="rounded-lg border bg-card p-4 space-y-3"
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
            className="rounded-lg border bg-card p-4"
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

          {/* Limpeza de dados por período */}
          <div
            className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <p className="text-sm font-semibold text-destructive">
                Limpar dados por período
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Remove permanentemente os registros selecionados dentro do intervalo
              de datas. Fotos das refeições também são apagadas do storage.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="purge-from" className="text-xs">De</Label>
                <Input
                  id="purge-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="purge-to" className="text-xs">Até</Label>
                <Input
                  id="purge-to"
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {(
                [
                  { key: "meal_records", label: "Lançamentos de refeições (+ fotos)" },
                  { key: "audit_logs", label: "Logs de auditoria" },
                  { key: "logs_acesso", label: "Registro de acessos" },
                ] as { key: PurgeTarget; label: string }[]
              ).map((it) => (
                <label
                  key={it.key}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={targets[it.key]}
                    onCheckedChange={(v) => {
                      setTargets((t) => ({ ...t, [it.key]: !!v }));
                      setPreview(null);
                    }}
                  />
                  {it.label}
                </label>
              ))}
            </div>

            {preview && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-semibold">Prévia da exclusão</p>
                {preview.map((p) => (
                  <div key={p.target} className="flex justify-between text-xs">
                    <span>{p.label}</span>
                    <span className="font-mono">
                      {p.count.toLocaleString("pt-BR")} registro(s)
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs pt-1 border-t mt-1">
                  <span className="font-semibold">Total</span>
                  <span className="font-mono font-semibold">
                    {preview
                      .reduce((a, p) => a + p.count, 0)
                      .toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={previewing || selectedTargets.length === 0}
                onClick={async () => {
                  setPreviewing(true);
                  setPreview(null);
                  try {
                    const r = (await doPreview({
                      data: { targets: selectedTargets, from, to },
                    })) as { items: typeof preview };
                    setPreview(r.items);
                  } catch (e: any) {
                    toast.error(toUserMessage(e, "Falha ao carregar prévia"));
                  } finally {
                    setPreviewing(false);
                  }
                }}
              >
                <Eye className="h-4 w-4 mr-1" />
                {previewing ? "Calculando..." : "Ver prévia"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={
                  purging ||
                  selectedTargets.length === 0 ||
                  !preview ||
                  preview.reduce((a, p) => a + p.count, 0) === 0
                }
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
          </p>
        </>
      )}

      <AdminPasswordDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar limpeza de dados"
        description={`Isso vai excluir permanentemente os registros selecionados entre ${from} e ${to}. Digite a sua senha para confirmar.`}
        confirmLabel="Excluir permanentemente"
        onConfirmed={async (senha) => {
          setPurging(true);
          try {
            // A senha é conferida no SERVIDOR (executePurge → exigirSenhaAdmin).
            const r = (await doExecute({
              data: { targets: selectedTargets, from, to, senha },
            })) as {
              deleted: { label: string; count: number }[];
              photosRemoved: number;
            };
            const total = r.deleted.reduce((a, d) => a + d.count, 0);
            toast.success(
              `${total.toLocaleString("pt-BR")} registro(s) excluídos${
                r.photosRemoved ? ` · ${r.photosRemoved} foto(s) removidas` : ""
              }`,
            );
            setPreview(null);
            await load();
          } catch (e: any) {
            toast.error(toUserMessage(e, "Falha na exclusão"));
          } finally {
            setPurging(false);
          }
        }}
      />
    </div>
  );
}
