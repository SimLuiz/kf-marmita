import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, UserPlus, Building2, IdCard } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  company: string | null;
  created_at: string;
}

export const Route = createFileRoute("/funcionarios")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function Page() {
  const { user } = useAuth();
  const [list, setList] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("name");
    if (error) toast.error(error.message);
    else setList((data as Employee[]) ?? []);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits && cpfDigits.length !== 11) {
      return toast.error("CPF deve ter 11 dígitos");
    }
    setLoading(true);
    const { error } = await supabase.from("employees").insert({
      name: name.trim(),
      cpf: cpfDigits ? formatCPF(cpfDigits) : null,
      company: company.trim() || null,
      owner_id: user.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setName("");
    setCpf("");
    setCompany("");
    toast.success("Funcionário cadastrado");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este funcionário e todos os seus registros?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Funcionário removido");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Funcionários</h2>
        <p className="text-sm text-muted-foreground">{list.length} cadastrados</p>
      </div>

      <form
        onSubmit={add}
        className="bg-card rounded-2xl p-4 space-y-3"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome *</Label>
          <Input
            id="name"
            placeholder="Nome do funcionário"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Empresa</Label>
            <Input
              id="company"
              placeholder="Empresa"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          <UserPlus className="h-4 w-4 mr-1" /> Cadastrar funcionário
        </Button>
      </form>

      <div className="space-y-2">
        {list.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            Nenhum funcionário cadastrado ainda.
          </p>
        )}
        {list.map((emp) => (
          <div
            key={emp.id}
            className="bg-card rounded-xl p-4 flex items-center justify-between gap-3"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 shrink-0 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{emp.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {emp.cpf && (
                    <span className="inline-flex items-center gap-1">
                      <IdCard className="h-3 w-3" /> {emp.cpf}
                    </span>
                  )}
                  {emp.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {emp.company}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(emp.id)}
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
