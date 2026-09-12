import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, KeyRound, User as UserIcon, Lock, LockOpen } from "lucide-react";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import {
  listAppUsers,
  createAppUser,
  deleteAppUser,
  resetAppUserPassword,
  setAppUserBlocked,
} from "@/lib/admin-users.functions";
import { PASSWORD_POLICY_HINT, validatePassword } from "@/lib/password-policy";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários do sistema | Marmita Control" },
      { name: "description", content: "Crie, bloqueie e remova contas de acesso ao controle de marmitas." },
      { property: "og:title", content: "Usuários do sistema | Marmita Control" },
      { property: "og:description", content: "Crie, bloqueie e remova contas de acesso ao controle de marmitas." },
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

interface AppUser {
  id: string;
  username: string;
  created_at: string;
  roles: string[];
  blocked: boolean;
  banned_until: string | null;
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const deleteFn = useServerFn(deleteAppUser);
  const resetFn = useServerFn(resetAppUserPassword);
  const blockFn = useServerFn(setAppUserBlocked);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [uname, setUname] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AppUser | null>(null);
  const [blockPending, setBlockPending] = useState<AppUser | null>(null);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [newPwd, setNewPwd] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Acesso restrito ao administrador");
      navigate({ to: "/" });
    }
  }, [loading, isAdmin, navigate]);

  const load = async () => {
    try {
      const data = await listFn();
      setUsers(Array.isArray(data) ? (data as AppUser[]) : []);
    } catch (e: any) {
      const msg =
        e instanceof Response
          ? `${e.status} ${await e.text().catch(() => e.statusText)}`
          : e?.message ?? "Erro ao listar usuários";
      console.error("listAppUsers failed:", e);
      toast.error(msg);
      setUsers([]);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uname.trim()) return toast.error("Informe o usuário");
    const check = validatePassword(pwd);
    if (!check.ok) return toast.error(check.errors[0]);
    setBusy(true);
    try {
      await createFn({ data: { username: uname.trim(), password: pwd } });
      toast.success("Usuário criado");
      setUname("");
      setPwd("");
      load();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Erro ao criar usuário"));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    const check = validatePassword(newPwd);
    if (!check.ok) return toast.error(check.errors[0]);
    try {
      await resetFn({ data: { userId: resetFor.id, password: newPwd } });
      toast.success("Senha alterada");
      setResetFor(null);
      setNewPwd("");
    } catch (e: any) {
      toast.error(toUserMessage(e, "Erro"));
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Usuários do sistema</h2>
        <p className="text-sm text-muted-foreground">
          Apenas o admin pode criar, alterar a senha ou excluir usuários.
        </p>
      </div>

      <form
        onSubmit={add}
        className="bg-card rounded-lg p-4 space-y-3"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="u">Usuário</Label>
          <Input
            id="u"
            placeholder="ex: joao"
            value={uname}
            onChange={(e) => setUname(e.target.value)}
            autoCapitalize="none"
            maxLength={32}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p">Senha</Label>
          <Input
            id="p"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            minLength={12}
            required
          />
          <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          <UserPlus className="h-4 w-4 mr-1" /> Cadastrar usuário
        </Button>
      </form>

      <div className="space-y-2">
        {users.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">
            Nenhum usuário cadastrado.
          </p>
        )}
        {users.map((u) => {
          const admin = u.roles.includes("admin");
          return (
            <div
              key={u.id}
              className={`bg-card rounded-lg p-4 flex items-center gap-3 ${u.blocked ? "opacity-70" : ""}`}
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                {admin ? (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                ) : (
                  <UserIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {u.username}
                  {u.blocked && (
                    <span className="text-[10px] uppercase tracking-wide bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">
                      Bloqueado
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {admin ? "Administrador" : "Usuário comum"}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setResetFor(u)}
                aria-label="Alterar senha"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              {!admin && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setBlockPending(u)}
                    aria-label={u.blocked ? "Desbloquear" : "Bloquear"}
                  >
                    {u.blocked ? (
                      <LockOpen className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Lock className="h-4 w-4 text-amber-600" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setPending(u)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <AdminPasswordDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Excluir usuário"
        description={`Digite sua senha de admin para excluir "${pending?.username ?? ""}".`}
        onConfirmed={async () => {
          if (!pending) return;
          await deleteFn({ data: { userId: pending.id } });
          toast.success("Usuário excluído");
          setPending(null);
          load();
        }}
      />

      <AdminPasswordDialog
        open={!!blockPending}
        onOpenChange={(o) => !o && setBlockPending(null)}
        title={blockPending?.blocked ? "Desbloquear usuário" : "Bloquear usuário"}
        description={`Digite sua senha de admin para ${
          blockPending?.blocked ? "desbloquear" : "bloquear"
        } "${blockPending?.username ?? ""}".`}
        onConfirmed={async () => {
          if (!blockPending) return;
          try {
            await blockFn({
              data: { userId: blockPending.id, blocked: !blockPending.blocked },
            });
            toast.success(blockPending.blocked ? "Usuário desbloqueado" : "Usuário bloqueado");
            setBlockPending(null);
            load();
          } catch (e: any) {
            toast.error(toUserMessage(e, "Erro"));
          }
        }}
      />


      {/* Reset password dialog */}
      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={doReset}
            className="bg-card rounded-lg p-5 w-full max-w-sm space-y-3"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <h3 className="font-semibold">Nova senha para {resetFor.username}</h3>
            <Input
              type="password"
              minLength={12}
              required
              autoFocus
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Nova senha"
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setResetFor(null);
                  setNewPwd("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
