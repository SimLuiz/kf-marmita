import { useAuth } from "@/lib/auth";
import { LoginScreen } from "./LoginScreen";
import { AppShell } from "./AppShell";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  useInactivityLogout();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  return <AppShell>{children}</AppShell>;
}
