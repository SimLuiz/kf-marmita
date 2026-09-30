import { useEffect, useState } from "react";
import { editarFuncionario } from "@/lib/dados.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/safe-error";

interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  company: string | null;
  sector: string | null;
  vinculo?: string | null;
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

interface Props {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export function EditEmployeeDialog({ employee, open, onOpenChange, onSaved }: Props) {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [vinculo, setVinculo] = useState("clt");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setName(employee.name);
      setCpf(employee.cpf ?? "");
      setCompany(employee.company ?? "");
      setSector(employee.sector ?? "");
      setVinculo(employee.vinculo ?? "clt");
    }
  }, [employee]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    // Mesmas regras do cadastro: tudo obrigatório e CPF com 11 dígitos.
    const cpfDigits = cpf.replace(/\D/g, "");
    if (!name.trim() || !company.trim() || !sector.trim()) return toast.error("Preencha todos os campos");
    if (cpfDigits.length !== 11) return toast.error("CPF deve ter 11 dígitos");
    setSaving(true);
    try {
      await editarFuncionario({
        data: {
          id: employee.id,
          name: name.trim(),
          cpf: cpfDigits,
          company: company.trim(),
          sector: sector.trim(),
          vinculo: vinculo as "clt" | "pj" | "visitante" | "aniversariante",
        },
      });
    } catch (err) {
      setSaving(false);
      return toast.error(toUserMessage(err));
    }
    setSaving(false);
    toast.success("Cadastro atualizado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar funcionário</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nome *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cpf">CPF *</Label>
              <Input
                id="edit-cpf"
                placeholder="000.000.000-00"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-company">Empresa *</Label>
              <Input
                id="edit-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sector">Setor *</Label>
            <Input
              id="edit-sector"
              placeholder="Setor / departamento"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-vinculo">Vínculo *</Label>
            <select
              id="edit-vinculo"
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
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !company.trim() || !sector.trim() || cpf.replace(/\D/g, "").length !== 11}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
