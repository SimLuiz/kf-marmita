import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { cadastroMarmitas, listarFuncionarios, registrarRetirada } from "@/lib/dados.functions";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
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
  head: () => ({
    meta: [
      { title: "Registrar retirada de marmita | KF Marmita" },
      { name: "description", content: "Registre a retirada da marmita com assinatura do funcionário, fornecedor e valor." },
      { property: "og:title", content: "Registrar retirada de marmita | KF Marmita" },
      { property: "og:description", content: "Registre a retirada da marmita com assinatura do funcionário, fornecedor e valor." },
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
        className="rounded-lg overflow-hidden bg-white border border-border"
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
  const { can } = usePermissions();
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
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [emps, cad] = await Promise.all([listarFuncionarios(), cadastroMarmitas()]);
        setEmployees(emps as Employee[]);
        setSuppliers(cad.fornecedores as Supplier[]);
        setMealTypes(cad.tipos as MealType[]);
      } catch (e) {
        toast.error(toUserMessage(e, "Não foi possível carregar os funcionários"));
      } finally {
        setCarregando(false);
      }
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
    if (!selected || !selectedType || !sigBlob || !user || saving) return;
    setSaving(true);
    try {
      // A assinatura vai como PNG em base64; o servidor grava no Storage e cria
      // o lançamento com o preço do tipo de marmita (não o que a tela mostra).
      const assinatura = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(new Error("Falha ao ler a assinatura"));
        leitor.readAsDataURL(sigBlob);
      });
      await registrarRetirada({
        data: {
          employee_id: selected.id,
          meal_type_id: selectedType.id,
          assinatura,
          ...((isAdmin || can("can_backdate_records")) && customDate
            ? { taken_at: new Date(customDate).toISOString() }
            : {}),
        },
      });

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

  // Sem isto, a mensagem "cadastre funcionários" piscava enquanto carregava.
  if (carregando) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

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
        <p className="text-sm font-semibold text-muted-foreground">
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
                  className="w-full bg-card rounded-lg p-4 flex items-center gap-3 text-left hover:bg-accent transition-colors"
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
          className="bg-card rounded-lg p-3 flex items-center justify-between"
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
                className="bg-card rounded-lg p-4 space-y-2"
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
            className="bg-card rounded-lg p-3 flex items-center justify-between"
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

          {(isAdmin || can("can_backdate_records")) && (
            <div
              className="bg-card rounded-lg p-3 space-y-1.5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Data e hora do lançamento
              </label>
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para usar agora. Você pode escolher datas passadas ou futuras.
              </p>
            </div>
          )}

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
