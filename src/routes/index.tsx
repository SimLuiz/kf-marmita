import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Users, Pen, FileText, Utensils } from "lucide-react";

export const Route = createFileRoute("/")({
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

      const [{ count: emp }, { count: today }, { count: month }] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }),
        supabase
          .from("meal_records")
          .select("*", { count: "exact", head: true })
          .gte("taken_at", startDay.toISOString()),
        supabase
          .from("meal_records")
          .select("*", { count: "exact", head: true })
          .gte("taken_at", startMonth.toISOString()),
      ]);
      setStats({ employees: emp ?? 0, today: today ?? 0, month: month ?? 0 });
    })();
  }, [user]);

  const cards = [
    { label: "Funcionários", value: stats.employees, icon: Users },
    { label: "Hoje", value: stats.today, icon: Utensils },
    { label: "Este mês", value: stats.month, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Olá! 👋</h2>
        <p className="text-muted-foreground text-sm">Resumo de retiradas</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-card rounded-2xl p-4 text-center"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <c.icon className="h-5 w-5 mx-auto text-primary mb-2" />
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      <Link
        to="/registrar"
        className="block rounded-2xl p-6 text-primary-foreground text-center"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-soft)" }}
      >
        <Camera className="h-8 w-8 mx-auto mb-2" />
        <div className="text-lg font-bold">Registrar retirada</div>
        <div className="text-sm opacity-90">Tirar foto da marmita</div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/funcionarios"
          className="bg-card rounded-2xl p-5"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <Users className="h-6 w-6 text-primary mb-2" />
          <div className="font-semibold">Funcionários</div>
          <div className="text-xs text-muted-foreground">Cadastrar e gerenciar</div>
        </Link>
        <Link
          to="/relatorio"
          className="bg-card rounded-2xl p-5"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <FileText className="h-6 w-6 text-primary mb-2" />
          <div className="font-semibold">Relatório</div>
          <div className="text-xs text-muted-foreground">Fechamento mensal</div>
        </Link>
      </div>
    </div>
  );
}
