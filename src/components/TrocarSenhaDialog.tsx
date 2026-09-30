import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trocarMinhaSenha } from "@/lib/admin-users.functions";
import { toUserMessage } from "@/lib/safe-error";

export const DICA_SENHA =
  "Mínimo de 10 caracteres, sem termos óbvios (senha, admin, marmita…), sequências (12345, abcde) nem o seu nome.";

export function TrocarSenhaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fechar = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setAtual("");
      setNova("");
      setConfirma("");
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova !== confirma) return toast.error("A confirmação não confere com a nova senha");
    setSalvando(true);
    try {
      await trocarMinhaSenha({ data: { atual, nova } });
      toast.success("Senha alterada");
      fechar(false);
    } catch (err) {
      toast.error(toUserMessage(err, "Não foi possível trocar a senha"));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar minha senha</DialogTitle>
          <DialogDescription>{DICA_SENHA}</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input id="senha-atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <Input id="senha-nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha-confirma">Repita a nova senha</Label>
            <Input id="senha-confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => fechar(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !atual || !nova || !confirma}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
