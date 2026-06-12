import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface MeUser {
  id: string;
  username: string | null;
}

interface AuthCtx {
  user: MeUser | null;
  session: { id: string } | null; // compat: muitos componentes só checam !!session
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  verifyAdminPassword: (password: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { getMe } = await import("@/lib/session.functions");
      const me = await getMe();
      if (me.signedIn) {
        setUser({ id: me.userId, username: me.username });
        setUsername(me.username);
        setIsAdmin(me.isAdmin);
      } else {
        setUser(null);
        setUsername(null);
        setIsAdmin(false);
      }
    } catch {
      setUser(null);
      setUsername(null);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const signIn: AuthCtx["signIn"] = async (uname, password) => {
    try {
      const { loginWithPassword } = await import("@/lib/session.functions");
      await loginWithPassword({ data: { username: uname.trim(), password } });
      await refresh();
      return { error: null };
    } catch (e: any) {
      // Tenta extrair erro estruturado do Response
      let msg = "invalid_credentials";
      if (e instanceof Response) {
        try {
          const body = await e.text();
          msg = body || msg;
        } catch {
          /* noop */
        }
      } else if (e?.message) {
        msg = e.message;
      }
      return { error: msg };
    }
  };

  const signOut = async () => {
    try {
      const { logout } = await import("@/lib/session.functions");
      await logout();
    } catch {
      /* noop */
    }
    setUser(null);
    setUsername(null);
    setIsAdmin(false);
    // Limpeza defensiva de qualquer resíduo herdado
    try {
      if (typeof window !== "undefined") {
        const wipe = (s: Storage) => {
          const keys: string[] = [];
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (!k) continue;
            if (
              k.startsWith("sb-") ||
              k.includes("supabase") ||
              k.startsWith("auth.") ||
              k.startsWith("login-attempts:")
            ) {
              keys.push(k);
            }
          }
          keys.forEach((k) => s.removeItem(k));
        };
        wipe(window.localStorage);
        wipe(window.sessionStorage);
      }
    } catch {
      /* noop */
    }
  };

  const verifyAdminPassword = async (password: string) => {
    try {
      const { verifyAdminPassword: vfn } = await import("@/lib/session.functions");
      const r = await vfn({ data: { password } });
      return !!r.ok;
    } catch {
      return false;
    }
  };

  return (
    <Ctx.Provider
      value={{
        user,
        session: user ? { id: user.id } : null,
        username,
        isAdmin,
        loading,
        signIn,
        signOut,
        verifyAdminPassword,
        refresh,
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
