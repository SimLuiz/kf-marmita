// Permissões POR USUÁRIO (01/10) — antes era uma regra só para todos os
// usuários comuns. Cada linha é um usuário; a última é o PADRÃO, copiado para
// quem for criado depois (mudar o padrão não mexe em quem já existe).
// Só decide o que cada um pode fazer na tela; quem barra de verdade é o
// servidor (exigirPermissao em src/lib/middleware.ts).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProtectedShell } from "@/components/ProtectedShell";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";
import { listarPermissoes, salvarPermissao, salvarPermissaoUsuario } from "@/lib/dados.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/permissoes")({
  head: () => ({ meta: [{ title: "Permissões | KF Marmita" }] }),
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

type Permissoes = Record<PermissionKey, boolean>;
interface Linha {
  id: string;
  nome: string;
  usuario: string;
  admin: boolean;
  ativo: boolean;
  permissoes: Permissoes;
}

function Page() {
  const { isAdmin } = useAuth();
  const [padrao, setPadrao] = useState<Permissoes | null>(null);
  const [usuarios, setUsuarios] = useState<Linha[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const r = await listarPermissoes();
      setPadrao(r.padrao as Permissoes);
      setUsuarios((r.usuarios as Linha[]).filter((u) => !u.admin));
    } catch (e) {
      toast.error(toUserMessage(e, "Erro ao carregar as permissões"));
    }
  };

  useEffect(() => {
    if (isAdmin) carregar();
  }, [isAdmin]);

  if (!isAdmin) {
    return <p className="text-center text-sm text-muted-foreground py-12">Apenas o administrador pode acessar esta área.</p>;
  }

  const alterarUsuario = async (u: Linha, chave: PermissionKey, valor: boolean) => {
    const marca = `${u.id}:${chave}`;
    setSalvando(marca);
    setUsuarios((l) => l.map((x) => (x.id === u.id ? { ...x, permissoes: { ...x.permissoes, [chave]: valor } } : x)));
    try {
      await salvarPermissaoUsuario({ data: { id: u.id, chave, valor } });
    } catch (e) {
      setUsuarios((l) => l.map((x) => (x.id === u.id ? { ...x, permissoes: { ...x.permissoes, [chave]: !valor } } : x)));
      toast.error(toUserMessage(e));
    } finally {
      setSalvando(null);
    }
  };

  const alterarPadrao = async (chave: PermissionKey, valor: boolean) => {
    setSalvando(`padrao:${chave}`);
    setPadrao((p) => (p ? { ...p, [chave]: valor } : p));
    try {
      await salvarPermissao({ data: { chave, valor } });
    } catch (e) {
      setPadrao((p) => (p ? { ...p, [chave]: !valor } : p));
      toast.error(toUserMessage(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        O que cada usuário comum pode fazer. Administradores podem tudo e não aparecem aqui. A mudança vale na próxima ação
        do usuário.
      </p>

      <div className="bg-card rounded-lg overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Usuário</th>
              {PERMISSION_LABELS.map((p) => (
                <th key={p.key} className="px-3 py-2 text-center font-semibold" title={p.help}>
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={`border-t ${u.ativo ? "" : "opacity-60"}`}>
                <td className="px-3 py-2">
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.usuario}
                    {u.ativo ? "" : " · desativado"}
                  </div>
                </td>
                {PERMISSION_LABELS.map((p) => (
                  <td key={p.key} className="px-3 py-2 text-center">
                    <Switch
                      checked={!!u.permissoes[p.key]}
                      disabled={salvando === `${u.id}:${p.key}`}
                      onCheckedChange={(v) => alterarUsuario(u, p.key, v)}
                      aria-label={`${p.label} — ${u.nome}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {padrao && (
              <tr className="border-t-2 bg-muted/50">
                <td className="px-3 py-2">
                  <div className="font-semibold">Padrão para novos usuários</div>
                  <div className="text-xs text-muted-foreground">Copiado para quem for criado depois</div>
                </td>
                {PERMISSION_LABELS.map((p) => (
                  <td key={p.key} className="px-3 py-2 text-center">
                    <Switch
                      checked={!!padrao[p.key]}
                      disabled={salvando === `padrao:${p.key}`}
                      onCheckedChange={(v) => alterarPadrao(p.key, v)}
                      aria-label={`${p.label} — padrão`}
                    />
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSION_LABELS.map((p) => (
          <p key={p.key} className="text-xs text-muted-foreground">
            <b className="text-foreground">{p.label}:</b> {p.help}
          </p>
        ))}
      </div>
    </div>
  );
}
