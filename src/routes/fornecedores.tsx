import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Truck, Utensils, Pencil, Check, X } from "lucide-react";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores e marmitas | Marmita Control" },
      { name: "description", content: "Gerencie fornecedores, tipos de marmita e os valores pagos pela empresa e pelo funcionário." },
      { property: "og:title", content: "Fornecedores e marmitas | Marmita Control" },
      { property: "og:description", content: "Gerencie fornecedores, tipos de marmita e os valores pagos pela empresa e pelo funcionário." },
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

interface Supplier {
  id: string;
  name: string;
}
interface MealType {
  id: string;
  supplier_id: string;
  name: string;
  price: number;
  company_price: number;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { user, isAdmin } = useAuth();
  const { can } = usePermissions();
  const canManage = isAdmin || can("can_manage_suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [types, setTypes] = useState<MealType[]>([]);
  const [newSupplier, setNewSupplier] = useState("");
  const [editingSup, setEditingSup] = useState<{ id: string; name: string } | null>(null);
  const [typeForms, setTypeForms] = useState<
    Record<string, { name: string; price: string; company_price: string }>
  >({});
  const [editingType, setEditingType] = useState<
    { id: string; name: string; price: string; company_price: string } | null
  >(null);
  const [pendingSup, setPendingSup] = useState<Supplier | null>(null);
  const [pendingType, setPendingType] = useState<MealType | null>(null);

  const load = async () => {
    const [{ data: sups }, { data: mts }] = await Promise.all([
      supabase.from("suppliers").select("id,name").order("name"),
      (supabase as any)
        .from("meal_types")
        .select("id,supplier_id,name,price,company_price")
        .is("archived_at", null)
        .order("name"),
    ]);
    setSuppliers((sups as Supplier[]) ?? []);
    setTypes(
      ((mts as any[]) ?? []).map((t) => ({
        ...t,
        price: Number(t.price),
        company_price: Number(t.company_price ?? 0),
      }))
    );
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
    if (error) return toast.error(toUserMessage(error));
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
    if (error) return toast.error(toUserMessage(error));
    setEditingSup(null);
    toast.success("Fornecedor atualizado");
    load();
  };

  const addType = async (supplierId: string) => {
    const f = typeForms[supplierId];
    if (!f?.name.trim() || !user) return;
    const price = parseFloat((f.price || "0").replace(",", ".")) || 0;
    const company_price = parseFloat((f.company_price || "0").replace(",", ".")) || 0;
    const { error } = await (supabase as any).from("meal_types").insert({
      owner_id: user.id,
      supplier_id: supplierId,
      name: f.name.trim(),
      price,
      company_price,
    });
    if (error) return toast.error(toUserMessage(error));
    setTypeForms({ ...typeForms, [supplierId]: { name: "", price: "", company_price: "" } });
    toast.success("Tipo de marmita cadastrado");
    load();
  };

  const askRemoveType = (t: MealType) => setPendingType(t);

  const saveType = async () => {
    if (!editingType || !editingType.name.trim()) return;
    const price = parseFloat((editingType.price || "0").replace(",", ".")) || 0;
    const company_price = parseFloat((editingType.company_price || "0").replace(",", ".")) || 0;
    const { error } = await (supabase as any)
      .from("meal_types")
      .update({ name: editingType.name.trim(), price, company_price })
      .eq("id", editingType.id);
    if (error) return toast.error(toUserMessage(error));
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

      {canManage && (
        <form
          onSubmit={addSupplier}
          className="bg-card rounded-lg p-4 space-y-3"
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
      )}

      {suppliers.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">
          Nenhum fornecedor cadastrado.
        </p>
      ) : (
        <div className="space-y-4">
          {suppliers.map((s) => {
            const sTypes = types.filter((t) => t.supplier_id === s.id);
            const f = typeForms[s.id] ?? { name: "", price: "", company_price: "" };
            return (
              <div
                key={s.id}
                className="bg-card rounded-lg p-4 space-y-3"
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
                      {canManage && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingSup({ id: s.id, name: s.name })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                          <Button size="icon" variant="ghost" onClick={() => askRemoveSupplier(s)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          )}
                        </>
                      )}
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
                      <div key={t.id} className="space-y-2 bg-accent/40 rounded-lg p-2">
                        <Input
                          value={editingType.name}
                          onChange={(e) =>
                            setEditingType({ ...editingType, name: e.target.value })
                          }
                          placeholder="Nome da marmita"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Funcionário paga
                            </Label>
                            <Input
                              value={editingType.price}
                              onChange={(e) =>
                                setEditingType({ ...editingType, price: e.target.value })
                              }
                              inputMode="decimal"
                              placeholder="0,00"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Empresa paga
                            </Label>
                            <Input
                              value={editingType.company_price}
                              onChange={(e) =>
                                setEditingType({ ...editingType, company_price: e.target.value })
                              }
                              inputMode="decimal"
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingType(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                          <Button size="sm" onClick={saveType}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 bg-accent/40 rounded-lg px-3 py-2"
                      >
                        <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-sm">{t.name}</span>
                        <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-primary">
                            {brl(t.price)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Empresa: {brl(t.company_price)}
                          </div>
                        </div>
                        {canManage && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setEditingType({
                                  id: t.id,
                                  name: t.name,
                                  price: String(t.price).replace(".", ","),
                                  company_price: String(t.company_price).replace(".", ","),
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                            <Button size="icon" variant="ghost" onClick={() => askRemoveType(t)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  )}
                </div>

                {canManage && (
                  <div className="space-y-2 pt-1">
                    <Input
                      placeholder="Tipo (ex: Executiva)"
                      value={f.name}
                      onChange={(e) =>
                        setTypeForms({
                          ...typeForms,
                          [s.id]: { ...f, name: e.target.value },
                        })
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">
                          Funcionário paga
                        </Label>
                        <Input
                          placeholder="0,00"
                          inputMode="decimal"
                          value={f.price}
                          onChange={(e) =>
                            setTypeForms({
                              ...typeForms,
                              [s.id]: { ...f, price: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">
                          Empresa paga
                        </Label>
                        <Input
                          placeholder="0,00"
                          inputMode="decimal"
                          value={f.company_price}
                          onChange={(e) =>
                            setTypeForms({
                              ...typeForms,
                              [s.id]: { ...f, company_price: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => addType(s.id)}
                      disabled={!f.name.trim()}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adicionar marmita
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AdminPasswordDialog
        open={!!pendingSup}
        onOpenChange={(o: boolean) => !o && setPendingSup(null)}
        title="Excluir fornecedor"
        description={`Digite a senha do admin para excluir "${pendingSup?.name ?? ""}" e todos os seus tipos de marmita.`}
        onConfirmed={async () => {
          if (!pendingSup) return;
          const { error } = await supabase.from("suppliers").delete().eq("id", pendingSup.id);
          if (error) throw new Error(error.message);
          toast.success("Fornecedor removido");
          setPendingSup(null);
          load();
        }}
      />

      <AdminPasswordDialog
        open={!!pendingType}
        onOpenChange={(o: boolean) => !o && setPendingType(null)}
        title="Arquivar marmita"
        description={`Digite a senha do admin para arquivar "${pendingType?.name ?? ""}". Os registros históricos serão preservados no relatório.`}
        onConfirmed={async () => {
          if (!pendingType) return;
          const { error } = await supabase
            .from("meal_types")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", pendingType.id);
          if (error) throw new Error(error.message);
          toast.success("Marmita arquivada");
          setPendingType(null);
          load();
        }}
      />

    </div>
  );
}
