// Seletor de período das telas de fechamento (Relatórios, Conferência do
// fornecedor). Três modos:
//   • Competência — 26 do mês anterior a 25 do mês, IGUAL ao kf-rh (padrão);
//   • Por mês — 1º ao último dia;
//   • Por período — duas datas.
// Devolve sempre { inicio, fim, rotulo } com `fim` EXCLUSIVO (as consultas usam `lt`).
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { competenciaDe, competenciaSomar, diaLocal } from "@/lib/formatos";

export type Periodo = { inicio: Date; fim: Date; rotulo: string; slug: string };
type Modo = "competencia" | "mes" | "intervalo";

const deData = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
};
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function SeletorPeriodo({ onChange }: { onChange: (p: Periodo) => void }) {
  const [modo, setModo] = useState<Modo>("competencia");
  const [comp, setComp] = useState(() => competenciaDe(new Date()));
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [de, setDe] = useState(() => diaLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [ate, setAte] = useState(() => diaLocal(new Date()));

  const periodo = useMemo<Periodo>(() => {
    if (modo === "competencia") {
      return { inicio: comp.inicio, fim: comp.fim, rotulo: comp.rotulo, slug: `competencia-${comp.codigo.replace("/", "-")}` };
    }
    if (modo === "mes") {
      const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
      const rotulo = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { inicio: mes, fim, rotulo, slug: diaLocal(mes).slice(0, 7) };
    }
    const inicio = deData(de);
    const fimIncl = deData(ate);
    const fim = new Date(fimIncl.getFullYear(), fimIncl.getMonth(), fimIncl.getDate() + 1);
    return { inicio, fim, rotulo: `${fmt(inicio)} a ${fmt(fimIncl)}`, slug: `${de}_a_${ate}` };
  }, [modo, comp, mes, de, ate]);

  useEffect(() => onChange(periodo), [periodo.inicio.getTime(), periodo.fim.getTime()]);

  const mudar = (n: number) => {
    if (modo === "competencia") setComp((c) => competenciaSomar(c, n));
    else setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };

  return (
    <div className="bg-card rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["competencia", "Competência"],
            ["mes", "Por mês"],
            ["intervalo", "Por período"],
          ] as const
        ).map(([m, rot]) => (
          <Button key={m} size="sm" variant={modo === m ? "default" : "outline"} onClick={() => setModo(m)}>
            {rot}
          </Button>
        ))}
      </div>

      {modo === "intervalo" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground space-y-1">
              <span>De</span>
              <Input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Até</span>
              <Input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} />
            </label>
          </div>
          <div className="text-center text-sm font-semibold">{periodo.rotulo}</div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => mudar(-1)} aria-label="Anterior">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="font-semibold first-cap text-center">{periodo.rotulo}</div>
          <Button variant="ghost" size="icon" onClick={() => mudar(1)} aria-label="Próximo">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
