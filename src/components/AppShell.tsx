import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Home, Users, PenLine, FileText, LogOut, Truck, ShieldCheck, ScrollText, ShieldAlert, HardDrive, SlidersHorizontal, CalendarDays, UtensilsCrossed, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const baseItems = [
  { to: "/", label: "Início", icon: Home },
  { to: "/registrar", label: "Registrar retirada", icon: PenLine },
  { to: "/funcionarios", label: "Funcionários", icon: Users },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck },
  { to: "/por-dia", label: "Marmitas por dia", icon: CalendarDays },
  { to: "/relatorio", label: "Relatórios", icon: FileText },
] as const;

const adminItems = [
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck },
  { to: "/permissoes", label: "Permissões", icon: SlidersHorizontal },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText },
  { to: "/seguranca", label: "Segurança", icon: ShieldAlert },
  { to: "/armazenamento", label: "Armazenamento", icon: HardDrive },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut, username, isAdmin } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = isAdmin ? [...baseItems, ...adminItems] : baseItems;
  const mobileItems = [baseItems[0], baseItems[2], baseItems[1], baseItems[4]];
  const shortLabel = (to: string, label: string) =>
    to === "/por-dia" ? "Por dia" : to === "/funcionarios" ? "Equipe" : label;
  const secondaryItems = items.filter((item) => !mobileItems.some((mobile) => mobile.to === item.to));
  const activeFor = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-border px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-base font-bold">Marmita Control</p>
            <p className="text-xs text-muted-foreground">Gestão de retiradas</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Navegação principal">
          <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase text-muted-foreground">Operação</p>
          <div className="space-y-1">
            {baseItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} className={`nav-item ${activeFor(item.to) ? "nav-item-active" : ""}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
          {isAdmin && (
            <>
              <p className="px-3 pb-2 pt-6 text-[11px] font-bold uppercase text-muted-foreground">Administração</p>
              <div className="space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.to} to={item.to} className={`nav-item ${activeFor(item.to) ? "nav-item-active" : ""}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted p-2">
            <div className="min-w-0 px-1">
              <p className="truncate text-sm font-semibold">{username ?? "Carregando"}</p>
              <p className="text-xs text-muted-foreground">{isAdmin ? "Administrador" : "Usuário"}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 pb-24 md:pb-0">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur md:hidden">
          <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <UtensilsCrossed className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-display truncate text-sm font-bold">Marmita Control</p>
                <p className="truncate text-xs text-muted-foreground">{username ?? "Carregando"}</p>
              </div>
            </div>
            {isAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Administrador" />}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8 lg:px-10">{children}</main>
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-3 bottom-20 rounded-lg border border-border bg-card p-3 shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 pb-2">
              <p className="font-display font-bold">Mais opções</p>
              <Button variant="ghost" size="icon" onClick={() => setMoreOpen(false)} aria-label="Fechar menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={`nav-item ${activeFor(item.to) ? "nav-item-active" : ""}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden" aria-label="Navegação móvel">
        <div className="grid grid-cols-5 items-end px-2">
          {mobileItems.slice(0, 2).map((it) => {
            const active = activeFor(it.to);
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`mobile-nav-item ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center">{shortLabel(it.to, it.label)}</span>
              </Link>
            );
          })}
          <Link to="/registrar" className="group flex flex-col items-center gap-1 text-[10px] font-semibold text-primary">
            <span className="grid h-12 w-12 -translate-y-2 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-md transition-transform group-active:scale-95">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="-mt-2">Registrar</span>
          </Link>
          {mobileItems.slice(3).map((it) => {
            const active = activeFor(it.to);
            const Icon = it.icon;
            return (
              <Link key={it.to} to={it.to} className={`mobile-nav-item ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center">{shortLabel(it.to, it.label)}</span>
              </Link>
            );
          })}
          <Button variant="ghost" className="mobile-nav-item h-auto rounded-none px-0 py-1" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}>
            <Menu className="h-5 w-5 shrink-0" />
            Mais
          </Button>
        </div>
      </nav>
    </div>
  );
}
