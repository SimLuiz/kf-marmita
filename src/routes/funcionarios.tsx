import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  created_at: string;
}

export const Route = createFileRoute("/funcionarios")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

function Page() {
  const { user } = useAuth();
  const [list, setList] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("name");
    if (error) toast.error(error.message);
    else setList(data ?? []);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setLoading(true);
    const { error } = await supabase
      .from("employees")
      .insert({ name: name.trim(), owner_id: user.id });
    setLoading(false);
    if (error) return toast.error(error.message);
    setName("");
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
        className="bg-card rounded-2xl p-4 flex gap-2"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <Input
          placeholder="Nome do funcionário"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={loading || !name.trim()}>
          <UserPlus className="h-4 w-4 mr-1" /> Add
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
            className="bg-card rounded-xl p-4 flex items-center justify-between"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{emp.name}</span>
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
