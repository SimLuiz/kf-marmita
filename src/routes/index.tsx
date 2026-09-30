import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { resumoInicio } from "@/lib/dados.functions";
import { useAuth } from "@/lib/auth";
import { Users, PenLine, FileText, Utensils, ArrowRight, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início | KF Marmita" },
      { name: "description", content: "Resumo diário de retiradas de marmitas e funcionários." },
      { property: "og:title", content: "Início | KF Marmita" },
      { property: "og:description", content: "Resumo diário de retiradas de marmitas e funcionários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedShell>
      <Dashboard />
    </ProtectedShell>
  ),
});

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ employees: 0, today: 0, month: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const startMonth = new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);
      const startDay = new Date();
      startDay.setHours(0, 0, 0, 0);

      // Os limites do dia e do mês vão do NAVEGADOR (horário de Brasília): o
      // servidor roda em UTC e erraria a virada do dia em 3 horas.
      const r = await resumoInicio({
        data: { inicioDia: startDay.toISOString(), inicioMes: startMonth.toISOString() },
      });
      setStats({ employees: r.funcionarios, today: r.hoje, month: r.mes });
    })();
  }, [user]);

  const cards = [
    { label: "Funcionários ativos", value: stats.employees, icon: Users, detail: "Cadastrados no sistema" },
    { label: "Retiradas hoje", value: stats.today, icon: Utensils, detail: "Registradas até agora" },
    { label: "Retiradas no mês", value: stats.month, icon: CalendarDays, detail: "Desde o primeiro dia" },
  ];

  return (
    <div className="space-y-8">
      <div className="page-header">
        <p className="page-description">Acompanhe os números e acesse as tarefas mais usadas.</p>
        <Link to="/registrar" className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:flex">
          <PenLine className="h-4 w-4" />
          Registrar retirada
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <c.icon className="h-4 w-4" />
            </div>
            <div className="mt-5 text-3xl font-bold tabular-nums">{c.value}</div>
            <div className="mt-1 text-sm font-semibold">{c.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.detail}</div>
          </div>
        ))}
      </section>

      <Link
        to="/registrar"
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-lg bg-primary p-5 text-primary-foreground shadow-sm transition-transform active:scale-[0.99] sm:hidden"
      >
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary-foreground/15"><PenLine className="h-5 w-5" /></span>
        <span className="min-w-0"><span className="block font-bold">Registrar retirada</span><span className="block text-sm opacity-85">Selecionar marmita e coletar assinatura</span></span>
        <ArrowRight className="h-5 w-5 shrink-0" />
      </Link>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-bold uppercase tracking-[.6px]">Acessos rápidos</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/funcionarios"
          className="action-card"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block font-semibold">Funcionários</span><span className="block text-sm text-muted-foreground">Cadastros e históricos</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          to="/relatorio"
          className="action-card"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block font-semibold">Relatórios</span><span className="block text-sm text-muted-foreground">Períodos e exportações</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        </div>
      </section>
      </div>
  );
}
