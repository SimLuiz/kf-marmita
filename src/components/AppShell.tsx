// Moldura do sistema no padrão KF (kf-garantia/kf-dashboard): sidebar clara
// com a logo e os grupos, barra do topo com o ícone e o nome da tela, tema
// claro/escuro na mesma chave dos outros sistemas e o "Sair" vermelho.
// Em tablet/celular (≤1100px) a sidebar dá lugar à navegação de baixo — é onde
// o operador registra as retiradas.
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  FileText,
  HardDrive,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  PenLine,
  Plug,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { TrocarSenhaDialog } from "@/components/TrocarSenhaDialog";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  sub: string;
}

const OPERACAO: Item[] = [
  { to: "/", label: "Início", icon: Home, sub: "Resumo do dia" },
  { to: "/registrar", label: "Registrar retirada", icon: PenLine, sub: "Funcionário, marmita e assinatura" },
  { to: "/funcionarios", label: "Funcionários", icon: Users, sub: "Cadastro e histórico de retiradas" },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, sub: "Tipos de marmita e valores" },
  { to: "/por-dia", label: "Marmitas por dia", icon: CalendarDays, sub: "Totais do dia por tipo e por funcionário" },
  { to: "/relatorio", label: "Relatórios", icon: FileText, sub: "Fechamento por período · Excel e PDF" },
];

const ADMINISTRACAO: Item[] = [
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck, sub: "Acessos e verificação em duas etapas" },
  { to: "/permissoes", label: "Permissões", icon: SlidersHorizontal, sub: "O que o usuário comum pode fazer" },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText, sub: "Alterações feitas nos dados" },
  { to: "/seguranca", label: "Segurança", icon: ShieldAlert, sub: "Acessos, falhas e alertas" },
  { to: "/armazenamento", label: "Armazenamento", icon: HardDrive, sub: "Espaço do banco e limpeza" },
  { to: "/integracao", label: "Integração RH", icon: Plug, sub: "Endereço e chave para o kf-rh" },
];

function useTema() {
  // O primeiro render acontece no SERVIDOR, que não sabe o tema: o valor real
  // (aplicado pelo script do __root antes da pintura) é lido depois de montar.
  const [escuro, setEscuro] = useState(false);
  useEffect(() => {
    setEscuro(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);
  const alternar = () => {
    const novo = !escuro;
    if (novo) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("kfTema", novo ? "dark" : "light");
    } catch {
      /* sem armazenamento */
    }
    setEscuro(novo);
  };
  return { escuro, alternar };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const { escuro, alternar } = useTema();
  const [maisAberto, setMaisAberto] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);

  const ativo = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));
  const todos = isAdmin ? [...OPERACAO, ...ADMINISTRACAO] : OPERACAO;
  const atual = todos.find((i) => ativo(i.to)) ?? OPERACAO[0];
  const subtitulo = location.pathname.startsWith("/funcionarios/") ? "Histórico de retiradas do funcionário" : atual.sub;
  const Icone = atual.icon;

  const inicial = (user?.nome || user?.usuario || "?").charAt(0).toUpperCase();

  const baixo = [OPERACAO[0], OPERACAO[2], OPERACAO[4]];
  const noMais = todos.filter((i) => !baixo.includes(i) && i.to !== "/registrar");

  const grupo = (titulo: string, itens: Item[]) => (
    <div className="kf-grp" role="group" aria-label={titulo}>
      <span className="kf-grp-t" aria-hidden="true">
        {titulo}
      </span>
      {itens.map((i) => {
        const I = i.icon;
        return (
          <Link
            key={i.to}
            to={i.to}
            className={`tab ${ativo(i.to) ? "active" : ""}`}
            aria-current={ativo(i.to) ? "page" : undefined}
          >
            <span className="ic" aria-hidden="true">
              <I className="h-4 w-4" strokeWidth={1.8} />
            </span>
            {i.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <a href="#kf-conteudo" className="kf-skip">
        Pular para o conteúdo
      </a>

      <aside className="kf-side" aria-label="Navegação principal">
        <div className="kf-side-marca">
          <img src="/logo.jpg" width={34} height={34} alt="" />
          <div>
            <b>KF Baterias</b>
            <small>Marmitas</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Módulos">
          {grupo("Operação", OPERACAO)}
          {isAdmin && grupo("Administração", ADMINISTRACAO)}
        </nav>
        <div className="kf-side-rodape">
          <div className="kf-quem">
            <span className="avatar" aria-hidden="true">
              {inicial}
            </span>
            <div className="min-w-0">
              <b title={user?.nome}>{user?.nome}</b>
              <small>{isAdmin ? "Administrador" : "Usuário"}</small>
            </div>
          </div>
          <button type="button" className="btn-kf" onClick={() => setTrocarSenha(true)}>
            <KeyRound className="h-3.5 w-3.5" /> Trocar minha senha
          </button>
        </div>
      </aside>

      <div className="kf-conteudo">
        <header className="top">
          <div className="ic-pagina" aria-hidden="true">
            <Icone className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <h1 className="min-w-0">
            {atual.label}
            <small>{subtitulo}</small>
          </h1>
          <div className="top-acoes">
            <button
              type="button"
              className="btn-kf"
              onClick={alternar}
              title={escuro ? "Usar tema claro" : "Usar tema escuro"}
              aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
            >
              {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button type="button" className="btn-kf sair" onClick={signOut}>
              <LogOut className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main id="kf-conteudo" className="kf-wrap">
          {children}
        </main>
      </div>

      {maisAberto && (
        <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => setMaisAberto(false)}>
          <div
            className="absolute inset-x-3 bottom-24 rounded-[var(--kf-radius)] border border-border bg-card p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="font-bold">Mais opções</p>
              <button type="button" className="btn-kf" onClick={() => setMaisAberto(false)} aria-label="Fechar menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {noMais.map((i) => {
                const I = i.icon;
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={() => setMaisAberto(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                      ativo(i.to) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <I className="h-4 w-4 shrink-0" /> <span className="truncate">{i.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMaisAberto(false);
                  setTrocarSenha(true);
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                <KeyRound className="h-4 w-4 shrink-0" /> Trocar minha senha
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="kf-nav-baixo" aria-label="Navegação">
        <div className="grid grid-cols-5 items-end">
          {baixo.slice(0, 2).map((i) => {
            const I = i.icon;
            return (
              <Link key={i.to} to={i.to} className={`mobile-nav-item ${ativo(i.to) ? "ativo" : ""}`}>
                <I className="h-5 w-5" />
                <span className="w-full truncate text-center">{i.to === "/funcionarios" ? "Equipe" : i.label}</span>
              </Link>
            );
          })}
          <Link to="/registrar" className="flex flex-col items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--kf-bordo)" }}>
            <span
              className="grid h-12 w-12 -translate-y-2 place-items-center rounded-full border-4 text-white"
              style={{ background: "var(--kf-bordo)", borderColor: "var(--kf-surface)" }}
            >
              <PenLine className="h-5 w-5" />
            </span>
            <span className="-mt-2">Registrar</span>
          </Link>
          <Link to={baixo[2].to} className={`mobile-nav-item ${ativo(baixo[2].to) ? "ativo" : ""}`}>
            <CalendarDays className="h-5 w-5" />
            <span>Por dia</span>
          </Link>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => setMaisAberto((v) => !v)}
            aria-expanded={maisAberto}
          >
            <Menu className="h-5 w-5" />
            Mais
          </button>
        </div>
      </nav>

      <TrocarSenhaDialog open={trocarSenha} onOpenChange={setTrocarSenha} />
    </>
  );
}
