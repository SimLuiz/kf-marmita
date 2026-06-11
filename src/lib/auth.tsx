import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_DOMAIN = "marmita.local";

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${ADMIN_DOMAIN}`;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  verifyAdminPassword: (password: string) => Promise<boolean>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRoleAndProfile = async (s: Session | null) => {
    if (!s?.user) {
      setUsername(null);
      setIsAdmin(false);
      return;
    }
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", s.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", s.user.id),
    ]);
    setUsername(profile?.username ?? null);
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Defer to avoid deadlock
      setTimeout(() => loadRoleAndProfile(s), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadRoleAndProfile(data.session).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthCtx["signIn"] = async (uname, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(uname),
      password,
    });
    if (!error) {
      try {
        const { logAuditEvent } = await import("@/lib/audit.functions");
        await logAuditEvent({ data: { action: "LOGIN" } });
      } catch {
        /* non-blocking */
      }
    } else {
      try {
        const { logFailedLogin } = await import("@/lib/audit.functions");
        await logFailedLogin({ data: { username: uname } });
      } catch {
        /* non-blocking */
      }
    }
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    try {
      const { logAuditEvent } = await import("@/lib/audit.functions");
      await logAuditEvent({ data: { action: "LOGOUT" } });
    } catch {
      /* non-blocking */
    }
    await supabase.auth.signOut();
    // Limpeza defensiva: remove qualquer resíduo de token/cache sensível
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
    // Verify on a throwaway client so the current session is not disturbed
    const { createClient } = await import("@supabase/supabase-js");
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const tmp = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { error } = await tmp.auth.signInWithPassword({
      email: usernameToEmail("admin"),
      password,
    });
    return !error;
  };

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        username,
        isAdmin,
        loading,
        signIn,
        signOut,
        verifyAdminPassword,
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
