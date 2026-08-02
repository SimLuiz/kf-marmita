import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, Pen, FileText, LogOut, Truck, ShieldCheck, ScrollText, ShieldAlert, HardDrive, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const baseItems = [
  { to: "/", label: "Início", icon: Home },
  { to: "/funcionarios", label: "Funcion.", icon: Users },
  { to: "/fornecedores", label: "Fornec.", icon: Truck },
  { to: "/registrar", label: "Registrar", icon: Pen },
  { to: "/relatorio", label: "Relat.", icon: FileText },
] as const;

const adminItems = [
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
  { to: "/permissoes", label: "Permis.", icon: SlidersHorizontal },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText },
  { to: "/seguranca", label: "Segur.", icon: ShieldAlert },
  { to: "/armazenamento", label: "Armaz.", icon: HardDrive },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut, username, isAdmin } = useAuth();
  const location = useLocation();

  const items = isAdmin ? [...baseItems, ...adminItems] : baseItems;
  const perRow = items.length > 5 ? Math.ceil(items.length / 2) : items.length;


  return (
    <div className="min-h-screen flex flex-col pb-20">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Marmita Control</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[220px] flex items-center gap-1">
              {isAdmin && <ShieldCheck className="h-3 w-3 text-primary" />}
              {username ?? "..."}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className={`mx-auto max-w-2xl grid ${cols}`}>
          {items.map((it) => {
            const active =
              it.to === "/" ? location.pathname === "/" : location.pathname.startsWith(it.to);
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] transition-colors ${
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
