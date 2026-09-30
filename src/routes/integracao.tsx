import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Plug } from "lucide-react";
import { getRhApiKey } from "@/lib/rh-integration.functions";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/integracao")({
  head: () => ({
    meta: [
      { title: "Integração com o RH | KF Marmita" },
      { name: "description", content: "Endereço e chave de acesso para o sistema de RH consultar os lançamentos de marmitas." },
      { property: "og:title", content: "Integração com o RH | KF Marmita" },
      { property: "og:description", content: "Endereço e chave de acesso para o sistema de RH consultar os lançamentos de marmitas." },
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

function firstDayOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const fetchKey = useServerFn(getRhApiKey);
  const [key, setKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  const endpoint = `${origin}/api/public/rh/marmitas`;
  const exemplo = `${endpoint}?inicio=${firstDayOfMonth()}&fim=${new Date().toISOString().slice(0, 10)}`;

  const reveal = async () => {
    if (key) return setShow((s) => !s);
    setBusy(true);
    try {
      const res = await fetchKey({ data: {} } as any);
      setKey(res.key);
      setShow(true);
      if (!res.key) toast.error("Chave ainda não configurada");
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-description">
            O sistema de RH consulta os lançamentos de marmitas por um endereço protegido por chave.
          </p>
        </div>
      </div>

      <section className="bg-card space-y-3 rounded-lg p-4" style={{ boxShadow: "var(--shadow-card)" }}>
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4 text-primary" /> Endereço de consulta
        </h2>
        <code className="block overflow-x-auto rounded-lg bg-muted p-3 text-xs">{exemplo}</code>
        <p className="text-xs text-muted-foreground">
          As datas usam o formato AAAA-MM-DD e o dia final entra inteiro na consulta.
        </p>
        <Button variant="outline" size="sm" onClick={() => copy(exemplo, "Endereço")}>
          <Copy className="mr-1 h-4 w-4" /> Copiar endereço
        </Button>
      </section>

      <section className="bg-card space-y-3 rounded-lg p-4" style={{ boxShadow: "var(--shadow-card)" }}>
        <h2 className="font-semibold">Chave de acesso</h2>
        <p className="text-sm text-muted-foreground">
          O RH deve enviar esta chave em cada consulta, no cabeçalho
          <code className="mx-1 rounded bg-muted px-1">Authorization: Bearer SUA_CHAVE</code>.
          Não compartilhe fora do time responsável.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-muted p-3 text-xs">
          {show && key ? key : "••••••••••••••••••••••••••••••••"}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reveal} disabled={busy}>
            {show ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {busy ? "Carregando..." : show ? "Ocultar" : "Mostrar chave"}
          </Button>
          {key && (
            <Button variant="outline" size="sm" onClick={() => copy(key, "Chave")}>
              <Copy className="mr-1 h-4 w-4" /> Copiar chave
            </Button>
          )}
        </div>
      </section>

      <section className="bg-card space-y-2 rounded-lg p-4" style={{ boxShadow: "var(--shadow-card)" }}>
        <h2 className="font-semibold">O que o RH recebe</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Cada lançamento com data e hora, nome, CPF, empresa, setor e vínculo do funcionário.</li>
          <li>Tipo de marmita, fornecedor, valor do funcionário e valor da empresa.</li>
          <li>Totais do período conferidos no servidor.</li>
          <li>Somente leitura: o RH não altera nada no sistema.</li>
        </ul>
      </section>
    </div>
  );
}
