import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, Eraser, RotateCcw, Search, Truck, Utensils, X } from "lucide-react";
import { toUserMessage } from "@/lib/safe-error";

interface Employee {
  id: string;
  name: string;
  cpf?: string | null;
  company?: string | null;
}
interface Supplier { id: string; name: string }
interface MealType {
  id: string;
  supplier_id: string;
  name: string;
  price: number;
  company_price: number;
}

export const Route = createFileRoute("/registrar")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function SignaturePad({
  onChange,
}: {
  onChange: (blob: Blob | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#0f172a";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current) {
      canvasRef.current!.toBlob(
        (b) => onChange(b),
        "image/png",
      );
    }
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl overflow-hidden bg-white border border-border"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="block w-full touch-none"
          style={{ height: 420 }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Assine no quadro acima</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <Eraser className="h-4 w-4 mr-1" /> Limpar
        </Button>
      </div>
    </div>
  );
}

function Page() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [selectedType, setSelectedType] = useState<MealType | null>(null);
  const [sigBlob, setSigBlob] = useState<Blob | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [customDate, setCustomDate] = useState<string>("");


  useEffect(() => {
    if (!user) return;
    (async () => {
      const [emps, sups, mts] = await Promise.all([
        (supabase as any)
          .from("employees_view")
          .select("id,name,cpf,company")
          .is("archived_at", null)
          .order("name"),
        supabase.from("suppliers").select("id,name").order("name"),
        (supabase as any)
          .from("meal_types")
          .select("id,supplier_id,name,price,company_price")
          .is("archived_at", null)
          .order("name"),
      ]);

      setEmployees((emps.data as Employee[]) ?? []);
      setSuppliers((sups.data as Supplier[]) ?? []);
      setMealTypes(
        ((mts.data as any[]) ?? []).map((t) => ({
          ...t,
          price: Number(t.price),
          company_price: Number(t.company_price ?? 0),
        }))
      );
    })();
  }, [user]);

  const filtered = employees.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const digits = q.replace(/\D/g, "");
    const cpfDigits = (e.cpf ?? "").replace(/\D/g, "");
    return (
      e.name.toLowerCase().includes(q) ||
      (digits.length > 0 && cpfDigits.includes(digits))
    );
  });

  const save = async () => {
    if (!selected || !selectedType || !sigBlob || !user) return;
    setSaving(true);
    try {
      const path = `${user.id}/${Date.now()}-${selected.id}.png`;
      const { error: upErr } = await supabase.storage
        .from("meal-photos")
        .upload(path, sigBlob, { contentType: "image/png" });
      if (upErr) throw upErr;

      const insertPayload: any = {
        owner_id: user.id,
        employee_id: selected.id,
        meal_type_id: selectedType.id,
        photo_path: path,
        unit_price: selectedType.price,
        company_unit_price: selectedType.company_price,
      };
      if (isAdmin && customDate) {
        insertPayload.taken_at = new Date(customDate).toISOString();
      }
      const { error: insErr } = await (supabase as any).from("meal_records").insert(insertPayload);

      if (insErr) throw insErr;

      toast.success(`Marmita registrada para ${selected.name}`);
      setSigBlob(null);
      setSelected(null);
      setSelectedType(null);
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(toUserMessage(e, "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  };

  if (employees.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Cadastre funcionários antes de registrar retiradas.
        </p>
        <Button onClick={() => navigate({ to: "/funcionarios" })}>Cadastrar agora</Button>
      </div>
    );
  }

  if (mealTypes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Cadastre ao menos um fornecedor com tipos de marmita.
        </p>
        <Button onClick={() => navigate({ to: "/fornecedores" })}>Ir para fornecedores</Button>
      </div>
    );
  }

  const supplierOf = (id: string) => suppliers.find((s) => s.id === id);

  const step = !selected ? 1 : !selectedType ? 2 : 3;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Registrar retirada</h2>
        <p className="text-sm text-muted-foreground">
          {step === 1 && "1. Escolha o funcionário"}
          {step === 2 && "2. Escolha a marmita"}
          {step === 3 && "3. Colete a assinatura"}
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou CPF"
              className="pl-9"
            />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                Nenhum funcionário encontrado.
              </p>
            ) : (
              filtered.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => setSelected(emp)}
                  className="w-full bg-card rounded-xl p-4 flex items-center gap-3 text-left hover:bg-accent transition-colors"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{emp.name}</div>
                    {(emp.cpf || emp.company) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[emp.cpf, emp.company].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {step >= 2 && selected && (
        <div
          className="bg-card rounded-xl p-3 flex items-center justify-between"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold truncate">{selected.name}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setSelectedType(null); setSigBlob(null); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {suppliers.map((sup) => {
            const sTypes = mealTypes.filter((t) => t.supplier_id === sup.id);
            if (sTypes.length === 0) return null;
            return (
              <div
                key={sup.id}
                className="bg-card rounded-2xl p-4 space-y-2"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Truck className="h-4 w-4 text-primary" /> {sup.name}
                </div>
                <div className="space-y-2">
                  {sTypes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedType(t)}
                      className="w-full flex items-center gap-3 bg-accent/40 hover:bg-accent rounded-lg px-3 py-3 text-left transition-colors"
                    >
                      <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-sm font-medium">{t.name}</span>
                      <span className="text-sm font-bold text-primary">{brl(t.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {step === 3 && selectedType && (
        <div className="space-y-4">
          <div
            className="bg-card rounded-xl p-3 flex items-center justify-between"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" /> {supplierOf(selectedType.supplier_id)?.name}
              </div>
              <div className="font-semibold truncate">{selectedType.name}</div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold text-primary">{brl(selectedType.price)}</div>
              <button
                onClick={() => setSelectedType(null)}
                className="text-xs text-muted-foreground underline"
              >
                trocar
              </button>
            </div>
          </div>

          <SignaturePad key={padKey} onChange={setSigBlob} />

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => { setSigBlob(null); setPadKey((k) => k + 1); }}
              disabled={saving || !sigBlob}
            >
              <RotateCcw className="h-4 w-4 mr-1" /> Refazer
            </Button>
            <Button onClick={save} disabled={saving || !sigBlob}>
              <Check className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
