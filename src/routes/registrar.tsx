import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Check, RotateCcw, X } from "lucide-react";

interface Employee {
  id: string;
  name: string;
}

export const Route = createFileRoute("/registrar")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("employees")
      .select("id,name")
      .order("name")
      .then(({ data }) => setEmployees(data ?? []));
  }, [user]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoBlob(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    setPhotoBlob(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = async () => {
    if (!selected || !photoBlob || !user) return;
    setSaving(true);
    try {
      const ext = photoBlob.type.split("/")[1] || "jpg";
      const path = `${user.id}/${Date.now()}-${selected.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("meal-photos")
        .upload(path, photoBlob, { contentType: photoBlob.type });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("meal_records").insert({
        owner_id: user.id,
        employee_id: selected.id,
        photo_path: path,
      });
      if (insErr) throw insErr;

      toast.success(`Marmita registrada para ${selected.name}`);
      reset();
      setSelected(null);
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (employees.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Você precisa cadastrar funcionários antes de registrar retiradas.
        </p>
        <Button onClick={() => navigate({ to: "/funcionarios" })}>Cadastrar agora</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Registrar retirada</h2>
        <p className="text-sm text-muted-foreground">
          {!selected ? "1. Escolha o funcionário" : "2. Tire a foto da marmita"}
        </p>
      </div>

      {!selected ? (
        <div className="space-y-2">
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelected(emp)}
              className="w-full bg-card rounded-xl p-4 flex items-center gap-3 text-left hover:bg-accent transition-colors"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{emp.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="bg-card rounded-xl p-4 flex items-center justify-between"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                {selected.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold">{selected.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); reset(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            className="hidden"
          />

          {!photoPreview ? (
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-accent/30 flex flex-col items-center justify-center gap-3 hover:bg-accent/50 transition-colors"
            >
              <Camera className="h-12 w-12 text-primary" />
              <span className="font-semibold text-primary">Tirar foto</span>
              <span className="text-xs text-muted-foreground">Toque para abrir a câmera</span>
            </button>
          ) : (
            <>
              <div
                className="rounded-2xl overflow-hidden bg-card"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <img
                  src={photoPreview}
                  alt="Marmita"
                  className="w-full aspect-square object-cover"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={reset} disabled={saving}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Refazer
                </Button>
                <Button onClick={save} disabled={saving}>
                  <Check className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Confirmar"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
