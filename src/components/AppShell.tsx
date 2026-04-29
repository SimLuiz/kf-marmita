import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, Camera, FileText, LogOut, Truck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/", label: "Início", icon: Home },
  { to: "/funcionarios", label: "Funcion.", icon: Users },
  { to: "/fornecedores", label: "Fornec.", icon: Truck },
  { to: "/registrar", label: "Registrar", icon: Camera },
  { to: "/relatorio", label: "Relatório", icon: FileText },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col pb-20">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Marmita Control</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {items.map((it) => {
            const active = location.pathname === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
