import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  IdCard,
  Pencil,
  Trash2,
  Utensils,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  company: string | null;
}
interface Record {
  id: string;
  taken_at: string;
  photo_path: string;
  meal_type_id: string | null;
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [records, setRecords] = useState<RecordWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
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
    const { data, error } = await supabase
      .from("employees")
      .select("id,name,cpf,company")
      .eq("id", id)
      .maybeSingle();
    if (error) return toast.error(error.message);
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
    const { data, error } = await supabase
      .from("meal_records")
    const { data, error } = await supabase
      .from("meal_records")
      .select("id,taken_at,photo_path,meal_type_id,meal_types(name,price,suppliers(name))")
      .eq("employee_id", id)
      .gte("taken_at", range.start.toISOString())
      .lt("taken_at", range.end.toISOString())
      .order("taken_at", { ascending: false });
    if (error) {
      toast.error(error.message);
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

  const removeRecord = async (rec: RecordWithUrl) => {
    if (!confirm("Excluir este registro de marmita?")) return;
    const { error } = await supabase.from("meal_records").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("meal-photos").remove([rec.photo_path]);
    toast.success("Registro removido");
    loadRecords();
  };

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
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Editar
        </Button>
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
                <div className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {emp.company}
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

      <div
        className="bg-card rounded-2xl p-5 text-center"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <Utensils className="h-5 w-5 mx-auto text-primary mb-1" />
        <div className="text-3xl font-bold text-primary">{records.length}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          marmitas no mês
        </div>
      </div>

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
          <div className="space-y-2">
            {records.map((rec) => {
              const date = new Date(rec.taken_at);
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
                    <div className="font-medium capitalize">
                      {date.toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {date.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRecord(rec)}
                    aria-label="Excluir registro"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EditEmployeeDialog
        employee={emp}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={loadEmployee}
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
    </div>
  );
}
