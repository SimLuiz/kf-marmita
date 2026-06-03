import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const ADMIN_TIMEOUT_MS = 15 * 60 * 1000;
const USER_TIMEOUT_MS = 30 * 60 * 1000;

const EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

export function useInactivityLogout() {
  const { session, isAdmin, signOut } = useAuth();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;
    const timeout = isAdmin ? ADMIN_TIMEOUT_MS : USER_TIMEOUT_MS;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        toast.message("Sessão encerrada por inatividade");
        signOut();
      }, timeout);
    };

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, isAdmin, signOut]);
}
