import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Utensils, Users, Search } from "lucide-react";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/por-dia")({
  head: () => ({
    meta: [
      { title: "Marmitas por dia | Marmita Control" },
      { name: "description", content: "Acompanhe o total diário de marmitas por tipo e por funcionário." },
      { property: "og:title", content: "Marmitas por dia | Marmita Control" },
      { property: "og:description", content: "Acompanhe o total diário de marmitas por tipo e por funcionário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

interface Rec {
  id: string;
  employee_id: string;
  meal_type_id: string | null;
  taken_at: string;
  unit_price: number | null;
  company_unit_price: number | null;
  employees: { name: string } | null;
  meal_types: { name: string; price: number; company_price: number } | null;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function Page() {
  const { user } = useAuth();
  const [day, setDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const from = new Date(day);
      from.setHours(0, 0, 0, 0);
      const to = new Date(day);
      to.setHours(23, 59, 59, 999);
      const { data, error } = await fetchAllRows<Rec>((a, b) =>
        supabase
          .from("meal_records")
          .select("id, employee_id, meal_type_id, taken_at, unit_price, company_unit_price, employees(name), meal_types(name, price, company_price)")
          .gte("taken_at", from.toISOString())
          .lte("taken_at", to.toISOString())
          .order("taken_at", { ascending: true })
          .range(a, b)
      );
      if (!error) setRecords(data);
      setLoading(false);
    })();
  }, [user, day]);

  const shiftDay = (delta: number) => {
    setDay((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const byMeal = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; employee: number; company: number }>();
    for (const r of records) {
      const key = r.meal_type_id ?? "none";
      const name = r.meal_types?.name ?? "Não informada";
      const cur = map.get(key) ?? { name, qty: 0, employee: 0, company: 0 };
      cur.qty += 1;
      cur.employee += r.unit_price ?? r.meal_types?.price ?? 0;
      cur.company += r.company_unit_price ?? r.meal_types?.company_price ?? 0;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [records]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    for (const r of records) {
      const name = r.employees?.name ?? "—";
      const cur = map.get(r.employee_id) ?? { name, qty: 0 };
      cur.qty += 1;
      map.set(r.employee_id, cur);
    }
    return [...map.values()]
      .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }, [records, search]);

  const dayLabel = day.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Marmitas por dia</h2>
        <p className="text-muted-foreground text-sm">Acompanhamento diário</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} aria-label="Dia anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={toInputDate(day)} onChange={(e) => {
          const [y, m, d] = e.target.value.split("-").map(Number);
          if (y && m && d) setDay(new Date(y, m - 1, d, 0, 0, 0, 0));
        }} className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => shiftDay(1)} aria-label="Próximo dia">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground capitalize">{dayLabel}</p>

      <div className="bg-card rounded-lg p-4 flex items-center justify-between" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-primary" />
          <span className="font-semibold">Total do dia</span>
        </div>
        <span className="text-2xl font-bold">{loading ? "..." : records.length}</span>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" /> Por tipo de marmita
        </h3>
        {byMeal.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">Nenhum lançamento neste dia.</p>
        )}
        <div className="space-y-2">
          {byMeal.map((m) => (
            <div key={m.name} className="bg-card rounded-lg p-4 flex items-center justify-between" style={{ boxShadow: "var(--shadow-card)" }}>
              <div>
                <div className="font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  Funcionário: {brl(m.employee)} · Empresa: {brl(m.company)}
                </div>
              </div>
              <span className="text-xl font-bold text-primary">{m.qty}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Por funcionário
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {byEmployee.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">Nenhum funcionário encontrado.</p>
        )}
        <div className="space-y-2">
          {byEmployee.map((e) => (
            <div key={e.name} className="bg-card rounded-lg p-4 flex items-center justify-between" style={{ boxShadow: "var(--shadow-card)" }}>
              <span className="font-semibold">{e.name}</span>
              <span className="text-xl font-bold text-primary">{e.qty}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
