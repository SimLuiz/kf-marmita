import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { toUserMessage } from "@/lib/safe-error";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** Recebe a senha digitada e a manda junto com a ação: quem confere é o
   *  SERVIDOR. Antes o navegador conferia a senha e depois executava a ação
   *  por conta própria — a confirmação não protegia nada. */
  onConfirmed: (senha: string) => void | Promise<void>;
}

export function AdminPasswordDialog({
  open,
  onOpenChange,
  title = "Confirmação do administrador",
  description = "Digite a sua senha para confirmar.",
  confirmLabel = "Confirmar",
  onConfirmed,
}: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirmed(password);
      onOpenChange(false);
      setPassword("");
    } catch (err: any) {
      toast.error(toUserMessage(err, "Não foi possível concluir"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPassword("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-pwd">Sua senha</Label>
            <Input
              id="admin-pwd"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || !password}>
              {loading ? "Confirmando..." : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
