import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { pingSession } from "@/lib/session.functions";

const ADMIN_TIMEOUT_MIN = 20;
const USER_TIMEOUT_MIN = 60;
const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 min

const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function useInactivityLogout() {
  const { session, isAdmin, signOut } = useAuth();
  const timerRef = useRef<number | null>(null);
  const pingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;
    const timeoutMin = isAdmin ? ADMIN_TIMEOUT_MIN : USER_TIMEOUT_MIN;
    const timeoutMs = timeoutMin * 60 * 1000;

    const localExpire = () => {
      toast.message("Sessão encerrada por inatividade");
      signOut();
    };

    const resetLocal = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(localExpire, timeoutMs);
    };

    const serverPing = async () => {
      try {
        const r = await pingSession({ data: { max_minutes: timeoutMin } });
        if (r.expired) {
          toast.message("Sessão expirada (servidor)");
          await signOut();
        }
      } catch {
        /* offline ou falha — ignora; timer local cobre */
      }
    };

    EVENTS.forEach((e) => window.addEventListener(e, resetLocal, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") serverPing();
    };
    document.addEventListener("visibilitychange", onVisible);

    resetLocal();
    serverPing();
    pingRef.current = window.setInterval(serverPing, PING_INTERVAL_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (pingRef.current) window.clearInterval(pingRef.current);
      EVENTS.forEach((e) => window.removeEventListener(e, resetLocal));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, isAdmin, signOut]);
}
