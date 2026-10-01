import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { CancelarLancamentoDialog } from "@/components/CancelarLancamentoDialog";
import {
  cadastroMarmitas,
  editarLancamento,
  lancamentosDoFuncionario,
  obterFuncionario,
  reativarLancamento,
} from "@/lib/dados.functions";
import { diaLocal } from "@/lib/formatos";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/safe-error";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  IdCard,
  Pencil,
  Briefcase,
  Ban,
  RotateCcw,
  Utensils,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  company: string | null;
  sector: string | null;
}
interface MealTypeOpt {
  id: string;
  name: string;
  price: number;
  company_price: number;
  supplier_id: string;
  suppliers?: { name: string } | null;
}
interface Record {
  id: string;
  taken_at: string;
  photo_path: string;
  meal_type_id: string | null;
  unit_price: number | null;
  cancelado: boolean;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  meal_types: {
    name: string;
    price: number;
    suppliers: { name: string } | null;
  } | null;
}
interface RecordWithUrl extends Record {
  photoUrl: string | null;
}

export const Route = createFileRoute("/funcionarios/$id")({
  head: () => ({
    meta: [
      { title: "Histórico do funcionário | KF Marmita" },
      { name: "description", content: "Veja as marmitas retiradas por dia, fornecedor, valores e assinaturas do funcionário." },
      { property: "og:title", content: "Histórico do funcionário | KF Marmita" },
      { property: "og:description", content: "Veja as marmitas retiradas por dia, fornecedor, valores e assinaturas do funcionário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});


const monthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

function Page() {
  const { id } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [records, setRecords] = useState<RecordWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [aCancelar, setACancelar] = useState<RecordWithUrl | null>(null);
  const [aReativar, setAReativar] = useState<RecordWithUrl | null>(null);
  const [editRec, setEditRec] = useState<RecordWithUrl | null>(null);
  const [mealTypes, setMealTypes] = useState<MealTypeOpt[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [lightbox, setLightbox] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [cursor]);

  const loadEmployee = async () => {
    let data: Employee | null;
    try {
      data = (await obterFuncionario({ data: { id } })) as Employee | null;
    } catch (e) {
      return toast.error(toUserMessage(e));
    }
    if (!data) {
      toast.error("Funcionário não encontrado");
      navigate({ to: "/funcionarios" });
      return;
    }
    setEmp(data as Employee);
  };

  const loadRecords = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // O servidor já devolve cada lançamento com a URL assinada da assinatura.
      const lista = await lancamentosDoFuncionario({
        data: { id, inicio: range.start.toISOString(), fim: range.end.toISOString() },
      });
      setRecords(lista as RecordWithUrl[]);
    } catch (e) {
      toast.error(toUserMessage(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadEmployee();
  }, [user, id]);

  useEffect(() => {
    if (user) loadRecords();
  }, [user, id, range.start, range.end]);

  useEffect(() => {
    if (!isAdmin && !can("can_edit_records")) return;
    (async () => {
      const cad = await cadastroMarmitas();
      const nomeFornecedor = new Map(cad.fornecedores.map((f: any) => [f.id, f.name]));
      setMealTypes(
        cad.tipos.map((t: any) => ({ ...t, suppliers: { name: nomeFornecedor.get(t.supplier_id) ?? "" } })) as MealTypeOpt[],
      );
    })();
  }, [isAdmin]);


  if (!emp) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const monthName = monthLabel(cursor);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/funcionarios" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h2 className="text-xl font-bold flex-1 truncate">{emp.name}</h2>
        {can("can_edit_employees") && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        )}
      </div>

      <div
        className="bg-card rounded-lg p-4 space-y-2"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
            {emp.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{emp.name}</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {emp.cpf && (
                <div className="inline-flex items-center gap-1 mr-3">
                  <IdCard className="h-3 w-3" /> {emp.cpf}
                </div>
              )}
              {emp.company && (
                <div className="inline-flex items-center gap-1 mr-3">
                  <Building2 className="h-3 w-3" /> {emp.company}
                </div>
              )}
              {emp.sector && (
                <div className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> {emp.sector}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="bg-card rounded-lg p-3 flex items-center justify-between"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const d = new Date(cursor);
            d.setMonth(d.getMonth() - 1);
            setCursor(d);
          }}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="font-semibold first-cap">{monthName}</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const d = new Date(cursor);
            d.setMonth(d.getMonth() + 1);
            setCursor(d);
          }}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {(() => {
        // Cancelados não contam (aparecem riscados na lista, com o motivo).
        const ativos = records.filter((r) => !r.cancelado);
        const priceOf = (r: Record) =>
          Number(r.unit_price ?? r.meal_types?.price ?? 0) || 0;
        const total = ativos.reduce((s, r) => s + priceOf(r), 0);
        const fmt = (v: number) =>
          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return (
          <div
            className="bg-card rounded-lg p-5 grid grid-cols-2 gap-3 text-center"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div>
              <Utensils className="h-5 w-5 mx-auto text-primary mb-1" />
              <div className="text-3xl font-bold text-primary">{ativos.length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                marmitas no mês
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">{fmt(total)}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                valor total
              </div>
            </div>
          </div>
        );
      })()}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Dias e assinaturas
        </h3>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Nenhuma retirada registrada neste mês.
          </p>
        ) : (
          (() => {
            const fmt = (v: number) =>
              v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const groups = new Map<string, RecordWithUrl[]>();
            for (const r of records) {
              const key = diaLocal(new Date(r.taken_at));
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(r);
            }
            const days = Array.from(groups.entries()).sort((a, b) =>
              b[0].localeCompare(a[0])
            );
            return (
              <div className="space-y-4">
                {days.map(([day, items]) => {
                  const dayDate = new Date(day + "T00:00:00");
                  const doDia = items.filter((r) => !r.cancelado);
                  const dayTotal = doDia.reduce(
                    (s, r) => s + (Number(r.unit_price ?? r.meal_types?.price) || 0),
                    0
                  );
                  return (
                    <div key={day} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-sm font-semibold first-cap">
                          {dayDate.toLocaleDateString("pt-BR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {doDia.length} {doDia.length === 1 ? "marmita" : "marmitas"} ·{" "}
                          <span className="font-semibold text-foreground">
                            {fmt(dayTotal)}
                          </span>
                        </div>
                      </div>
                      {items.map((rec) => {
                        const date = new Date(rec.taken_at);
                        const price = Number(rec.unit_price ?? rec.meal_types?.price) || 0;
                        return (
                          <div
                            key={rec.id}
                            className={`bg-card rounded-lg p-3 flex items-center gap-3 ${rec.cancelado ? "opacity-60" : ""}`}
                            style={{ boxShadow: "var(--shadow-card)" }}
                          >
                            {rec.photoUrl ? (
                              <button
                                type="button"
                                onClick={() => setLightbox(rec.photoUrl!)}
                                className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0"
                              >
                                <img
                                  src={rec.photoUrl}
                                  alt="Assinatura"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <div className="h-16 w-16 rounded-lg bg-muted shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium truncate ${rec.cancelado ? "line-through" : ""}`}>
                                {rec.meal_types?.name ?? "Marmita"}
                              </div>
                              {rec.cancelado && (
                                <div className="text-xs font-semibold text-destructive">
                                  Cancelado{rec.motivo_cancelamento ? ` — ${rec.motivo_cancelamento}` : ""}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground truncate">
                                {rec.meal_types?.suppliers?.name ?? "Sem fornecedor"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {date.toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}{" "}
                                · <span className="font-semibold text-foreground">{fmt(price)}</span>
                              </div>
                            </div>
                            {(isAdmin || can("can_edit_records")) && (
                              <div className="flex flex-col gap-1">
                                {can("can_edit_records") && !rec.cancelado && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditRec(rec)}
                                  aria-label="Editar tipo de marmita"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                )}
                                {isAdmin && !rec.cancelado && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setACancelar(rec)}
                                  aria-label="Cancelar lançamento"
                                  title="Cancelar lançamento"
                                >
                                  <Ban className="h-4 w-4 text-destructive" />
                                </Button>
                                )}
                                {isAdmin && rec.cancelado && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setAReativar(rec)}
                                  aria-label="Reativar lançamento"
                                  title="Desfazer o cancelamento"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                )}
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      <EditEmployeeDialog
        employee={emp}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={loadEmployee}
      />

      <CancelarLancamentoDialog
        lancamento={
          aCancelar
            ? {
                id: aCancelar.id,
                descricao: `${aCancelar.meal_types?.name ?? "Marmita"} de ${new Date(aCancelar.taken_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`,
              }
            : null
        }
        onOpenChange={(o) => !o && setACancelar(null)}
        onCancelado={() => {
          setACancelar(null);
          loadRecords();
        }}
      />

      <AdminPasswordDialog
        open={!!aReativar}
        onOpenChange={(o: boolean) => !o && setAReativar(null)}
        title="Desfazer o cancelamento"
        description="O lançamento volta a valer e o RH volta a cobrar. Digite a sua senha para confirmar."
        confirmLabel="Reativar"
        onConfirmed={async (senha) => {
          if (!aReativar) return;
          await reativarLancamento({ data: { id: aReativar.id, senha } });
          toast.success("Lançamento reativado");
          setAReativar(null);
          loadRecords();
        }}
      />

      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <img
            src={lightbox}
            alt="Assinatura"
            className="max-h-full max-w-full rounded-lg"
          />
        </button>
      )}
      {(isAdmin || can("can_edit_records")) && (
        <EditMealTypeDialog
          record={editRec}
          mealTypes={mealTypes}
          onOpenChange={(o) => !o && setEditRec(null)}
          onSaved={() => {
            setEditRec(null);
            loadRecords();
          }}
        />
      )}
    </div>
  );
}

function EditMealTypeDialog({
  record,
  mealTypes,
  onOpenChange,
  onSaved,
}: {
  record: RecordWithUrl | null;
  mealTypes: MealTypeOpt[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [mealTypeId, setMealTypeId] = useState<string>("");
  const [taken, setTaken] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setMealTypeId(record.meal_type_id ?? "");
      const d = new Date(record.taken_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setTaken(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
  }, [record]);

  const save = async () => {
    if (!record) return;
    const mt = mealTypes.find((m) => m.id === mealTypeId);
    if (!mt) {
      toast.error("Selecione o tipo de marmita");
      return;
    }
    setSaving(true);
    try {
      // O valor é recalculado no servidor a partir do tipo escolhido.
      await editarLancamento({
        data: { id: record.id, meal_type_id: mt.id, ...(taken ? { taken_at: new Date(taken).toISOString() } : {}) },
      });
      toast.success("Registro atualizado");
      onSaved();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Erro ao atualizar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar registro</DialogTitle>
          <DialogDescription>
            Altere o tipo de marmita e/ou a data deste lançamento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo de marmita</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={mealTypeId}
              onChange={(e) => setMealTypeId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {mealTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.suppliers?.name ? `${m.suppliers.name} · ` : ""}
                  {m.name} — {Number(m.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data e hora</label>
            <input
              type="datetime-local"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={taken}
              onChange={(e) => setTaken(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !mealTypeId}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

