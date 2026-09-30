import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { AdminPasswordDialog } from "@/components/AdminPasswordDialog";
import { DICA_SENHA } from "@/components/TrocarSenhaDialog";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Lock, LockOpen, RotateCcw, ShieldCheck, Trash2, User as UserIcon, UserPlus } from "lucide-react";
import {
  alterarSenhaDeUsuario,
  criarUsuario,
  definirAtivo,
  definirExige2fa,
  excluirUsuario,
  listarUsuarios,
  resetar2fa,
} from "@/lib/admin-users.functions";
import { listarAcessos } from "@/lib/audit.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Usuários | KF Marmita" }] }),
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

interface Usuario {
  id: string;
  nome: string;
  usuario: string;
  admin: boolean;
  ativo: boolean;
  exige_2fa: boolean;
  totp_confirmado: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
  sessoes_abertas: number;
}

interface Acesso {
  id: number;
  usuario: string | null;
  ip: string | null;
  acao: string;
  detalhe: string | null;
  criado_em: string;
}

// Rótulos das ações de logs_acesso (sem rótulo, aparece o nome técnico).
const ACOES: Record<string, string> = {
  login_ok: "Entrou",
  login_falha: "Falha de login",
  login_bloqueado: "IP bloqueado",
  login_antirrobo: "Anti-robô recusou",
  logout: "Saiu",
  "2fa_configurado": "Configurou o 2FA",
  "2fa_resetado": "2FA resetado",
  "2fa_ligado": "2FA ligado",
  "2fa_desligado": "2FA desligado",
  senha_trocada: "Trocou a própria senha",
  confirmacao_falha: "Senha errada ao confirmar ação",
  admin_usuario_criado: "Criou usuário",
  admin_usuario_excluido: "Excluiu usuário",
  admin_usuario_desativado: "Desativou usuário",
  admin_usuario_reativado: "Reativou usuário",
  admin_senha_alterada: "Alterou senha de usuário",
  admin_promovido: "Tornou administrador",
  admin_rebaixado: "Tirou administrador",
};

const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nunca";

function Selo({ tom, children }: { tom: "ok" | "atencao" | "neutro" | "risco"; children: React.ReactNode }) {
  const cores = {
    ok: "bg-[var(--kf-green-soft)] text-[var(--kf-sobre-green)]",
    atencao: "bg-[var(--kf-accent-soft)] text-[var(--kf-sobre-accent)]",
    risco: "bg-[var(--kf-red-soft)] text-[var(--kf-sobre-red)]",
    neutro: "bg-muted text-muted-foreground",
  }[tom];
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${cores}`}>{children}</span>;
}

function Page() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const [aba, setAba] = useState<"usuarios" | "atividade">("usuarios");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [acessos, setAcessos] = useState<Acesso[]>([]);

  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [novoAdmin, setNovoAdmin] = useState(false);
  const [novo2fa, setNovo2fa] = useState(true);
  const [criando, setCriando] = useState(false);

  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [ativarAlvo, setAtivarAlvo] = useState<Usuario | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<Usuario | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Acesso restrito ao administrador");
      navigate({ to: "/" });
    }
  }, [loading, isAdmin, navigate]);

  const carregar = async () => {
    try {
      setUsuarios((await listarUsuarios()) as Usuario[]);
    } catch (e) {
      toast.error(toUserMessage(e, "Erro ao listar usuários"));
    }
  };
  const carregarAcessos = async () => {
    try {
      setAcessos((await listarAcessos()) as Acesso[]);
    } catch (e) {
      toast.error(toUserMessage(e, "Erro ao carregar a atividade"));
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (aba === "usuarios") carregar();
    else carregarAcessos();
  }, [isAdmin, aba]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      carregar();
    } catch (e) {
      toast.error(toUserMessage(e));
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    try {
      await criarUsuario({ data: { nome: nome.trim(), usuario: login.trim(), senha, admin: novoAdmin, exige_2fa: novoAdmin || novo2fa } });
      toast.success("Usuário criado");
      setNome("");
      setLogin("");
      setSenha("");
      setNovoAdmin(false);
      setNovo2fa(true);
      carregar();
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao criar usuário"));
    } finally {
      setCriando(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="inline-flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
        {(["usuarios", "atividade"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${
              aba === a ? "bg-card text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {a === "usuarios" ? "Usuários" : "Atividade"}
          </button>
        ))}
      </div>

      {aba === "usuarios" && (
        <>
          <form onSubmit={criar} className="bg-card rounded-lg p-4 space-y-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[.6px]">Novo usuário</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login">Usuário (para entrar)</Label>
                <Input
                  id="login"
                  placeholder="ex: joao"
                  autoCapitalize="none"
                  value={login}
                  onChange={(e) => setLogin(e.target.value.toLowerCase())}
                  maxLength={32}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha inicial</Label>
              <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              <p className="text-xs text-muted-foreground">{DICA_SENHA}</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={novoAdmin} onCheckedChange={setNovoAdmin} /> Administrador
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={novoAdmin || novo2fa} disabled={novoAdmin} onCheckedChange={setNovo2fa} /> Verificação em duas etapas
              </label>
            </div>
            <Button type="submit" disabled={criando || !nome.trim() || !login.trim() || !senha}>
              <UserPlus className="h-4 w-4 mr-1" /> Cadastrar usuário
            </Button>
          </form>

          <div className="space-y-2">
            {usuarios.map((u) => {
              const eu = u.id === user?.id;
              const usa2fa = u.admin || u.exige_2fa;
              return (
                <div key={u.id} className={`bg-card rounded-lg p-4 space-y-3 ${u.ativo ? "" : "opacity-70"}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-accent flex items-center justify-center">
                      {u.admin ? <ShieldCheck className="h-5 w-5 text-primary" /> : <UserIcon className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {u.nome} <span className="font-normal text-muted-foreground">· {u.usuario}</span>
                        {u.admin && <Selo tom="neutro">Admin</Selo>}
                        {!u.ativo && <Selo tom="risco">Desativado</Selo>}
                        {usa2fa ? (
                          u.totp_confirmado ? <Selo tom="ok">2FA ativo</Selo> : <Selo tom="atencao">2FA a configurar</Selo>
                        ) : (
                          <Selo tom="neutro">Sem 2FA</Selo>
                        )}
                        {u.sessoes_abertas > 0 && <Selo tom="ok">Conectado</Selo>}
                      </div>
                      <div className="text-xs text-muted-foreground">Último acesso: {quando(u.ultimo_acesso)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSenhaDe(u)}>
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> Senha
                    </Button>
                    {!u.admin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          acao(
                            () => definirExige2fa({ data: { id: u.id, exige: !u.exige_2fa } }),
                            u.exige_2fa ? "2FA desligado para este usuário" : "2FA ligado — será configurado no próximo acesso",
                          )
                        }
                      >
                        {u.exige_2fa ? "Desligar 2FA" : "Ligar 2FA"}
                      </Button>
                    )}
                    {usa2fa && u.totp_confirmado && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acao(() => resetar2fa({ data: { id: u.id } }), "2FA resetado — novo QR code no próximo acesso")}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resetar 2FA
                      </Button>
                    )}
                    {!eu && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setAtivarAlvo(u)}>
                          {u.ativo ? <Lock className="h-3.5 w-3.5 mr-1" /> : <LockOpen className="h-3.5 w-3.5 mr-1" />}
                          {u.ativo ? "Desativar" : "Reativar"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExcluirAlvo(u)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Excluir
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {aba === "atividade" && (
        <div className="bg-card rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Detalhe</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {acessos.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{quando(a.criado_em)}</td>
                  <td className="px-3 py-2">{a.usuario ?? "—"}</td>
                  <td className={`px-3 py-2 font-medium ${/falha|bloque|antirrobo/.test(a.acao) ? "text-destructive" : ""}`}>
                    {ACOES[a.acao] ?? a.acao}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.detalhe ?? ""}</td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{a.ip ?? ""}</td>
                </tr>
              ))}
              {acessos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum acesso registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!senhaDe} onOpenChange={(o) => !o && (setSenhaDe(null), setNovaSenha(""))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova senha para {senhaDe?.nome}</DialogTitle>
            <DialogDescription>{DICA_SENHA}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!senhaDe) return;
              try {
                await alterarSenhaDeUsuario({ data: { id: senhaDe.id, senha: novaSenha } });
                toast.success("Senha alterada");
                setSenhaDe(null);
                setNovaSenha("");
              } catch (err) {
                toast.error(toUserMessage(err));
              }
            }}
            className="space-y-3"
          >
            <Input type="password" autoComplete="new-password" autoFocus required value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Nova senha" />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSenhaDe(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!novaSenha}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AdminPasswordDialog
        open={!!ativarAlvo}
        onOpenChange={(o) => !o && setAtivarAlvo(null)}
        title={ativarAlvo?.ativo ? "Desativar usuário" : "Reativar usuário"}
        description={`Digite a sua senha para ${ativarAlvo?.ativo ? "desativar" : "reativar"} "${ativarAlvo?.nome ?? ""}".${
          ativarAlvo?.ativo ? " As sessões abertas dele são encerradas na hora." : ""
        }`}
        confirmLabel={ativarAlvo?.ativo ? "Desativar" : "Reativar"}
        onConfirmed={async (senhaAdmin) => {
          if (!ativarAlvo) return;
          await definirAtivo({ data: { id: ativarAlvo.id, ativo: !ativarAlvo.ativo, senha: senhaAdmin } });
          toast.success(ativarAlvo.ativo ? "Usuário desativado" : "Usuário reativado");
          setAtivarAlvo(null);
          carregar();
        }}
      />

      <AdminPasswordDialog
        open={!!excluirAlvo}
        onOpenChange={(o) => !o && setExcluirAlvo(null)}
        title="Excluir usuário"
        description={`Digite a sua senha para excluir "${excluirAlvo?.nome ?? ""}". Só é possível excluir quem nunca registrou nada — quem já lançou marmitas deve ser desativado.`}
        confirmLabel="Excluir"
        onConfirmed={async (senhaAdmin) => {
          if (!excluirAlvo) return;
          await excluirUsuario({ data: { id: excluirAlvo.id, senha: senhaAdmin } });
          toast.success("Usuário excluído");
          setExcluirAlvo(null);
          carregar();
        }}
      />
    </div>
  );
}
