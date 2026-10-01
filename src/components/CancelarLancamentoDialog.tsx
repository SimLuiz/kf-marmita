// Cancelar um lançamento: motivo (vai para o RH, em `observacao`) + a senha de
// quem está logado, conferida no servidor (cancelarLancamento).
import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelarLancamento } from "@/lib/dados.functions";
import { toUserMessage } from "@/lib/safe-error";

const MOTIVOS = ["Lançado em duplicidade", "Funcionário errado", "Marmita devolvida", "Lançado por engano"];

export function CancelarLancamentoDialog({
  lancamento,
  onOpenChange,
  onCancelado,
}: {
  lancamento: { id: string; descricao: string } | null;
  onOpenChange: (o: boolean) => void;
  onCancelado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  const fechar = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setMotivo("");
      setSenha("");
    }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lancamento) return;
    setEnviando(true);
    try {
      await cancelarLancamento({ data: { id: lancamento.id, motivo: motivo.trim(), senha } });
      toast.success("Lançamento cancelado — o RH recebe como cancelado e não cobra");
      fechar(false);
      onCancelado();
    } catch (err) {
      toast.error(toUserMessage(err, "Não foi possível cancelar"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!lancamento} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" /> Cancelar lançamento
          </DialogTitle>
          <DialogDescription>
            {lancamento?.descricao}. O lançamento continua no histórico, marcado como cancelado, e o RH não cobra.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={confirmar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} required />
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha-cancelar">Sua senha</Label>
            <Input id="senha-cancelar" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => fechar(false)} disabled={enviando}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={enviando || motivo.trim().length < 3 || !senha}>
              {enviando ? "Cancelando..." : "Cancelar lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
