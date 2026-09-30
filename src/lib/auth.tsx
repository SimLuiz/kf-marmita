// Quem está logado, do ponto de vista da tela. A fonte da verdade é o
// servidor (cookie HttpOnly + tabela `sessoes`): aqui só se guarda o resultado
// de `eu()` e se reage à sessão vencida.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { eu, sair } from "@/lib/sessao.functions";

export interface UsuarioLogado {
  id: string;
  nome: string;
  usuario: string;
  admin: boolean;
}

interface AuthCtx {
  /** null = mostrar a tela de login */
  user: UsuarioLogado | null;
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  entrou: (u: UsuarioLogado) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

// Mesmos limites do servidor (src/server/sessao.ts). O servidor é quem manda —
// este relógio só fecha a tela na hora certa, em vez de a pessoa só descobrir
// que a sessão caiu no próximo clique.
const INATIVIDADE_MIN_ADMIN = 20;
const INATIVIDADE_MIN_DEMAIS = 60;
const EVENTOS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UsuarioLogado | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    eu()
      .then((u) => setUser(u ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await sair();
    } catch {
      /* mesmo sem resposta, a tela volta para o login */
    }
    setUser(null);
  }, []);

  // Sessão recusada pelo servidor em qualquer chamada → volta ao login.
  useEffect(() => {
    const aoExpirar = () => {
      setUser((atual) => {
        if (atual) toast.message("Sua sessão expirou. Entre novamente.");
        return null;
      });
    };
    window.addEventListener("kf:sessao-expirada", aoExpirar);
    return () => window.removeEventListener("kf:sessao-expirada", aoExpirar);
  }, []);

  // Inatividade.
  useEffect(() => {
    if (!user) return;
    const limiteMs = (user.admin ? INATIVIDADE_MIN_ADMIN : INATIVIDADE_MIN_DEMAIS) * 60 * 1000;
    const reiniciar = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        toast.message("Sessão encerrada por inatividade");
        signOut();
      }, limiteMs);
    };
    EVENTOS.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      EVENTOS.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, [user, signOut]);

  return (
    <Ctx.Provider
      value={{
        user,
        username: user?.usuario ?? null,
        isAdmin: !!user?.admin,
        loading,
        entrou: setUser,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
