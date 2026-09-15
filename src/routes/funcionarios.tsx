import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/safe-error";
import {
  Trash2,
  UserPlus,
  Building2,
  IdCard,
  Pencil,
  ChevronRight,
  Briefcase,
  Search,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  company: string | null;
  sector: string | null;
  created_at: string;
}

export const Route = createFileRoute("/funcionarios")({
  head: () => ({
    meta: [
      { title: "Funcionários | Marmita Control" },
      { name: "description", content: "Cadastre, edite e pesquise funcionários por nome ou CPF no controle de marmitas." },
      { property: "og:title", content: "Funcionários | Marmita Control" },
      { property: "og:description", content: "Cadastre, edite e pesquise funcionários por nome ou CPF no controle de marmitas." },
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

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function Page() {
  const location = useLocation();

  if (location.pathname !== "/funcionarios") {
    return <Outlet />;
  }

  return <FuncionariosList />;
}

function FuncionariosList() {
  const { user, isAdmin } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [list, setList] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [vinculo, setVinculo] = useState("clt");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [query, setQuery] = useState("");


  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("employees_view")
      .select("*")
      .is("archived_at", null)
      .order("name");
    if (error) toast.error(toUserMessage(error));
    else setList((data as Employee[]) ?? []);
  };


  useEffect(() => {
    if (user) load();
  }, [user]);

  const cpfDigits = cpf.replace(/\D/g, "");
  const formValid =
    !!name.trim() && cpfDigits.length === 11 && !!company.trim() && !!sector.trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const qDigits = q.replace(/\D/g, "");
    return list.filter((emp) => {
      const byName = emp.name.toLowerCase().includes(q);
      const byCpf =
        !!qDigits && !!emp.cpf && emp.cpf.replace(/\D/g, "").includes(qDigits);
      return byName || byCpf;
    });
  }, [list, query]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !company.trim() || !sector.trim()) {
      return toast.error("Preencha todos os campos");
    }
    if (cpfDigits.length !== 11) {
      return toast.error("CPF deve ter 11 dígitos");
    }
    setLoading(true);
    const { error } = await supabase.from("employees").insert({
      name: name.trim(),
      cpf: formatCPF(cpfDigits),
      company: company.trim(),
      sector: sector.trim(),
      owner_id: user.id,
    });
    setLoading(false);
    if (error)
      return toast.error(
        error.code === "23505" ? "Já existe um funcionário com esse CPF" : toUserMessage(error)
      );
    setName("");
    setCpf("");
    setCompany("");
    setSector("");
    toast.success("Funcionário cadastrado");
    load();
  };

  const askRemove = (emp: Employee, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete(emp);
  };

  const openEdit = (emp: Employee, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(emp);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Funcionários</h2>
        <p className="text-sm text-muted-foreground">
          {list.length} cadastrados · toque em um nome para ver as marmitas
        </p>
      </div>

      {can("can_create_employees") && (
      <form
        onSubmit={add}
        className="bg-card rounded-lg p-4 space-y-3"
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
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Empresa *</Label>
            <Input
              id="company"
              placeholder="Empresa"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sector">Setor *</Label>
            <Input
              id="sector"
              placeholder="Setor / departamento"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              maxLength={100}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vinculo">Vínculo *</Label>
          <select
            id="vinculo"
            value={vinculo}
            onChange={(e) => setVinculo(e.target.value)}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <option value="clt">CLT</option>
            <option value="pj">PJ</option>
            <option value="visitante">Visitante</option>
            <option value="aniversariante">Aniversariante</option>
          </select>
        </div>
        <Button type="submit" className="w-full" disabled={loading || !formValid}>
          <UserPlus className="h-4 w-4 mr-1" /> Cadastrar funcionário
        </Button>
        {!formValid && (
          <p className="text-xs text-muted-foreground text-center">
            Preencha nome, CPF (11 dígitos), empresa e setor para concluir o cadastro.
          </p>
        )}
      </form>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Pesquisar por nome ou CPF"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            {list.length === 0
              ? "Nenhum funcionário cadastrado ainda."
              : "Nenhum funcionário encontrado para essa busca."}
          </p>
        )}
        {filtered.map((emp) => (
          <div
            key={emp.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate({ to: "/funcionarios/$id", params: { id: emp.id } })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate({ to: "/funcionarios/$id", params: { id: emp.id } });
              }
            }}
            className="w-full bg-card rounded-lg p-4 flex items-center gap-3 text-left hover:bg-accent/40 transition-colors cursor-pointer"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground">
              {emp.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
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
                {emp.sector && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {emp.sector}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {can("can_edit_employees") && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => openEdit(emp, e)}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => askRemove(emp, e)}
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>

      <EditEmployeeDialog
        employee={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />

      <AdminPasswordDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Arquivar funcionário"
        description={`Digite a senha do admin para arquivar "${pendingDelete?.name ?? ""}". Os registros de marmitas dele serão preservados no histórico.`}
        onConfirmed={async () => {
          if (!pendingDelete) return;
          const { error } = await supabase
            .from("employees")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", pendingDelete.id);
          if (error) throw new Error(error.message);
          toast.success("Funcionário arquivado");
          setPendingDelete(null);
          load();
        }}
      />

    </div>
  );
}
