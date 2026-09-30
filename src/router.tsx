import { createRouter, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function Aviso({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <img src="/logo.jpg" width={64} height={64} alt="" className="mx-auto mb-6 rounded-full" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        {children}
      </div>
    </div>
  );
}

function ErroPadrao({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const mensagem = error instanceof Error ? error.message : String(error ?? "");
  return (
    <Aviso titulo="Algo deu errado" texto="Ocorreu um erro inesperado. Tente de novo.">
      {import.meta.env.DEV && mensagem && (
        <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
          {mensagem}
        </pre>
      )}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="btn-kf"
          style={{ background: "var(--kf-bordo)", borderColor: "var(--kf-bordo)", color: "#fff", fontWeight: 700 }}
        >
          Tentar de novo
        </button>
        <a href="/" className="btn-kf">
          Ir para o início
        </a>
      </div>
    </Aviso>
  );
}

function NaoEncontrada() {
  return (
    <Aviso titulo="Página não encontrada" texto="O endereço não existe ou foi alterado.">
      <a href="/" className="btn-kf mt-6 inline-flex">
        Ir para o início
      </a>
    </Aviso>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErroPadrao,
    defaultNotFoundComponent: NaoEncontrada,
  });

  return router;
};
