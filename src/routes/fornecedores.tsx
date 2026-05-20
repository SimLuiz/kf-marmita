import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Truck, Utensils, Pencil, Check, X } from "lucide-react";

export const Route = createFileRoute("/fornecedores")({
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

interface Supplier {
  id: string;
  name: string;
}
interface MealType {
  id: string;
  supplier_id: string;
  name: string;
  price: number;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { user, isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [types, setTypes] = useState<MealType[]>([]);
  const [newSupplier, setNewSupplier] = useState("");
  const [editingSup, setEditingSup] = useState<{ id: string; name: string } | null>(null);
  const [typeForms, setTypeForms] = useState<Record<string, { name: string; price: string }>>({});
  const [editingType, setEditingType] = useState<{ id: string; name: string; price: string } | null>(null);
  const [pendingSup, setPendingSup] = useState<Supplier | null>(null);
  const [pendingType, setPendingType] = useState<MealType | null>(null);

  const load = async () => {
    const [{ data: sups }, { data: mts }] = await Promise.all([
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("meal_types").select("id,supplier_id,name,price").order("name"),
    ]);
    setSuppliers((sups as Supplier[]) ?? []);
    setTypes(((mts as any[]) ?? []).map((t) => ({ ...t, price: Number(t.price) })));
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.trim() || !user) return;
    const { error } = await supabase
      .from("suppliers")
      .insert({ name: newSupplier.trim(), owner_id: user.id });
    if (error) return toast.error(error.message);
    setNewSupplier("");
    toast.success("Fornecedor cadastrado");
    load();
  };

  const askRemoveSupplier = (s: Supplier) => setPendingSup(s);

  const saveSupplier = async () => {
    if (!editingSup || !editingSup.name.trim()) return;
    const { error } = await supabase
      .from("suppliers")
      .update({ name: editingSup.name.trim() })
      .eq("id", editingSup.id);
    if (error) return toast.error(error.message);
    setEditingSup(null);
    toast.success("Fornecedor atualizado");
    load();
  };

  const addType = async (supplierId: string) => {
    const f = typeForms[supplierId];
    if (!f?.name.trim() || !user) return;
    const price = parseFloat(f.price.replace(",", ".")) || 0;
    const { error } = await supabase.from("meal_types").insert({
      owner_id: user.id,
      supplier_id: supplierId,
      name: f.name.trim(),
      price,
    });
    if (error) return toast.error(error.message);
    setTypeForms({ ...typeForms, [supplierId]: { name: "", price: "" } });
    toast.success("Tipo de marmita cadastrado");
    load();
  };

  const removeType = async (id: string) => {
    if (!confirm("Excluir esta marmita?")) return;
    const { error } = await supabase.from("meal_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    load();
  };

  const saveType = async () => {
    if (!editingType || !editingType.name.trim()) return;
    const price = parseFloat(editingType.price.replace(",", ".")) || 0;
    const { error } = await supabase
      .from("meal_types")
      .update({ name: editingType.name.trim(), price })
      .eq("id", editingType.id);
    if (error) return toast.error(error.message);
    setEditingType(null);
    toast.success("Atualizado");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Fornecedores</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre fornecedores e os tipos de marmita com valor
        </p>
      </div>

      <form
        onSubmit={addSupplier}
        className="bg-card rounded-2xl p-4 space-y-3"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="sup">Novo fornecedor</Label>
          <Input
            id="sup"
            placeholder="Nome do fornecedor"
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
            maxLength={100}
          />
        </div>
        <Button type="submit" className="w-full" disabled={!newSupplier.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Cadastrar fornecedor
        </Button>
      </form>

      {suppliers.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">
          Nenhum fornecedor cadastrado.
        </p>
      ) : (
        <div className="space-y-4">
          {suppliers.map((s) => {
            const sTypes = types.filter((t) => t.supplier_id === s.id);
            const f = typeForms[s.id] ?? { name: "", price: "" };
            return (
              <div
                key={s.id}
                className="bg-card rounded-2xl p-4 space-y-3"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary shrink-0" />
                  {editingSup?.id === s.id ? (
                    <>
                      <Input
                        value={editingSup.name}
                        onChange={(e) => setEditingSup({ ...editingSup, name: e.target.value })}
                        className="flex-1"
                      />
                      <Button size="icon" variant="ghost" onClick={saveSupplier}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingSup(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold flex-1 truncate">{s.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingSup({ id: s.id, name: s.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeSupplier(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  {sTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma marmita cadastrada.
                    </p>
                  )}
                  {sTypes.map((t) =>
                    editingType?.id === t.id ? (
                      <div key={t.id} className="flex items-center gap-2">
                        <Input
                          value={editingType.name}
                          onChange={(e) =>
                            setEditingType({ ...editingType, name: e.target.value })
                          }
                          className="flex-1"
                        />
                        <Input
                          value={editingType.price}
                          onChange={(e) =>
                            setEditingType({ ...editingType, price: e.target.value })
                          }
                          inputMode="decimal"
                          className="w-24"
                        />
                        <Button size="icon" variant="ghost" onClick={saveType}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingType(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 bg-accent/40 rounded-lg px-3 py-2"
                      >
                        <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-sm">{t.name}</span>
                        <span className="text-sm font-semibold text-primary">
                          {brl(t.price)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setEditingType({
                              id: t.id,
                              name: t.name,
                              price: String(t.price).replace(".", ","),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => removeType(t.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Tipo (ex: Executiva)"
                    value={f.name}
                    onChange={(e) =>
                      setTypeForms({ ...typeForms, [s.id]: { ...f, name: e.target.value } })
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Valor"
                    inputMode="decimal"
                    value={f.price}
                    onChange={(e) =>
                      setTypeForms({ ...typeForms, [s.id]: { ...f, price: e.target.value } })
                    }
                    className="w-24"
                  />
                  <Button onClick={() => addType(s.id)} disabled={!f.name.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
