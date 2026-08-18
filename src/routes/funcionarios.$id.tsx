import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
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
  Trash2,
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
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
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
  const [pendingDelete, setPendingDelete] = useState<RecordWithUrl | null>(null);
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
    const { data, error } = await (supabase as any)
      .from("employees_view")
      .select("id,name,cpf,company,sector")
      .eq("id", id)
      .maybeSingle();
    if (error) return toast.error(toUserMessage(error));
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
    const { data, error } = await fetchAllRows((f, t) =>
      supabase
        .from("meal_records")
        .select("id,taken_at,photo_path,meal_type_id,unit_price,meal_types(name,price,suppliers(name))")
        .eq("employee_id", id)
        .gte("taken_at", range.start.toISOString())
        .lt("taken_at", range.end.toISOString())
        .order("taken_at", { ascending: false })
        .range(f, t)
    );
    if (error) {
      toast.error(toUserMessage(error));
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Record[];
    const withUrls = await Promise.all(
      list.map(async (r) => {
        const { data: signed } = await supabase.storage
          .from("meal-photos")
          .createSignedUrl(r.photo_path, 60 * 60);
        return { ...r, photoUrl: signed?.signedUrl ?? null };
      })
    );
    setRecords(withUrls);
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
      const { data } = await (supabase as any)
        .from("meal_types")
        .select("id,name,price,company_price,supplier_id,suppliers(name)")
        .is("archived_at", null)
        .order("name");
      setMealTypes((data as MealTypeOpt[]) ?? []);
    })();
  }, [isAdmin]);

  const askRemoveRecord = (rec: RecordWithUrl) => setPendingDelete(rec);


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
        className="bg-card rounded-2xl p-4 space-y-2"
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
        className="bg-card rounded-2xl p-3 flex items-center justify-between"
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
        <div className="font-semibold capitalize">{monthName}</div>
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
        const priceOf = (r: Record) =>
          Number(r.unit_price ?? r.meal_types?.price ?? 0) || 0;
        const total = records.reduce((s, r) => s + priceOf(r), 0);
        const fmt = (v: number) =>
          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return (
          <div
            className="bg-card rounded-2xl p-5 grid grid-cols-2 gap-3 text-center"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div>
              <Utensils className="h-5 w-5 mx-auto text-primary mb-1" />
              <div className="text-3xl font-bold text-primary">{records.length}</div>
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
          Dias e fotos
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
              const key = new Date(r.taken_at).toISOString().slice(0, 10);
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
                  const dayTotal = items.reduce(
                    (s, r) => s + (Number(r.unit_price ?? r.meal_types?.price) || 0),
                    0
                  );
                  return (
                    <div key={day} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-sm font-semibold capitalize">
                          {dayDate.toLocaleDateString("pt-BR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {items.length} {items.length === 1 ? "marmita" : "marmitas"} ·{" "}
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
                            className="bg-card rounded-xl p-3 flex items-center gap-3"
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
                                  alt="Marmita"
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <div className="h-16 w-16 rounded-lg bg-muted shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {rec.meal_types?.name ?? "Marmita"}
                              </div>
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
                                {can("can_edit_records") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditRec(rec)}
                                  aria-label="Editar tipo de marmita"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                )}
                                {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => askRemoveRecord(rec)}
                                  aria-label="Excluir registro"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
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

      <AdminPasswordDialog
        open={!!pendingDelete}
        onOpenChange={(o: boolean) => !o && setPendingDelete(null)}
        title="Excluir registro"
        description="Digite a senha do admin para excluir este registro de marmita."
        onConfirmed={async () => {
          if (!pendingDelete) return;
          const { error } = await supabase
            .from("meal_records")
            .delete()
            .eq("id", pendingDelete.id);
          if (error) throw new Error(error.message);
          await supabase.storage.from("meal-photos").remove([pendingDelete.photo_path]);
          toast.success("Registro removido");
          setPendingDelete(null);
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
            alt="Foto da marmita"
            className="max-h-full max-w-full rounded-xl"
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
      const payload: any = {
        meal_type_id: mt.id,
        unit_price: mt.price,
        company_unit_price: mt.company_price,
      };
      if (taken) payload.taken_at = new Date(taken).toISOString();
      const { error } = await (supabase as any)
        .from("meal_records")
        .update(payload)
        .eq("id", record.id);
      if (error) throw error;
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

