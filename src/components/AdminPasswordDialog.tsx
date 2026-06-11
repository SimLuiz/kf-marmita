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
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { toUserMessage } from "@/lib/safe-error";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  description?: string;
  onConfirmed: () => void | Promise<void>;
}

export function AdminPasswordDialog({
  open,
  onOpenChange,
  title = "Confirmação do administrador",
  description = "Digite a senha do admin para confirmar esta exclusão.",
  onConfirmed,
}: Props) {
  const { verifyAdminPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await verifyAdminPassword(password);
    if (!ok) {
      setLoading(false);
      toast.error("Senha do admin incorreta");
      return;
    }
    try {
      await onConfirmed();
      onOpenChange(false);
      setPassword("");
    } catch (err: any) {
      toast.error(toUserMessage(err, "Erro ao excluir"));
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
            <Label htmlFor="admin-pwd">Senha do admin</Label>
            <Input
              id="admin-pwd"
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || !password}>
              {loading ? "Confirmando..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
