import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UtensilsCrossed, ShieldAlert } from "lucide-react";
import {
  clearAttempts,
  formatRemaining,
  getLockRemainingMs,
  registerFailure,
} from "@/lib/login-lockout";
import { toUserMessage } from "@/lib/safe-error";


export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockMs, setLockMs] = useState(0);

  useEffect(() => {
    if (!username) {
      setLockMs(0);
      return;
    }
    const tick = () => setLockMs(getLockRemainingMs(username));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [username]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const remaining = getLockRemainingMs(username);
    if (remaining > 0) {
      toast.error(`Usuário bloqueado. Tente novamente em ${formatRemaining(remaining)}.`);
      return;
    }
    setLoading(true);
    const { error } = await signIn(username, password);
    setLoading(false);
    if (error) {
      const r = registerFailure(username);
      // Nunca expor mensagem técnica do provedor — sempre genérico
      const safe = toUserMessage(error, "Usuário ou senha inválidos");
      if (r.locked) {
        setLockMs(r.remainingMs);
        toast.error(`Muitas tentativas. Bloqueado por ${formatRemaining(r.remainingMs)}.`);
      } else {
        toast.error(`${safe}. ${r.attemptsLeft} tentativa(s) restante(s).`);
      }
    } else {
      clearAttempts(username);
    }

  };

  const locked = lockMs > 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-4 h-16 w-16 rounded-2xl flex items-center justify-center text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-soft)" }}
          >
            <UtensilsCrossed className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Marmita Control</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acesso restrito · entre com seu usuário
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-card rounded-2xl p-6 space-y-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {locked && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Bloqueado por excesso de tentativas. Aguarde {formatRemaining(lockMs)}.</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || locked}>
            {loading ? "Entrando..." : locked ? `Bloqueado (${formatRemaining(lockMs)})` : "Entrar"}
          </Button>
          <p className="text-xs text-muted-foreground text-center pt-1">
            Novos usuários só podem ser criados pelo administrador.
          </p>
        </form>
      </div>
    </div>
  );
}
