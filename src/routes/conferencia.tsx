// Conferência com o fornecedor (01/10): quantidade e valor por dia × tipo de
// marmita, para bater com a nota fiscal. Cancelados ficam fora (só a contagem
// aparece). Período: competência (26 a 25, como o RH), mês ou intervalo.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { ProtectedShell } from "@/components/ProtectedShell";
import { SeletorPeriodo, type Periodo } from "@/components/SeletorPeriodo";
import { Button } from "@/components/ui/button";
import { conferenciaFornecedor } from "@/lib/dados.functions";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/safe-error";

export const Route = createFileRoute("/conferencia")({
  head: () => ({ meta: [{ title: "Conferência do fornecedor | KF Marmita" }] }),
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

interface Linha {
  dia: string;
  fornecedor: string;
  tipo: string;
  qtd: number;
  valor_funcionario: number;
  valor_empresa: number;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaBR = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

function Page() {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [cancelados, setCancelados] = useState(0);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!user || !periodo) return;
    setCarregando(true);
    conferenciaFornecedor({ data: { inicio: periodo.inicio.toISOString(), fim: periodo.fim.toISOString() } })
      .then((r) => {
        setLinhas(r.linhas as Linha[]);
        setCancelados(r.cancelados);
      })
      .catch((e) => toast.error(toUserMessage(e, "Não foi possível carregar a conferência")))
      .finally(() => setCarregando(false));
  }, [user, periodo?.inicio.getTime(), periodo?.fim.getTime()]);

  // fornecedor → { tipos, dias → tipo → linha, totais }
  const porFornecedor = useMemo(() => {
    const mapa = new Map<string, { tipos: string[]; dias: Map<string, Map<string, Linha>>; totalPorTipo: Map<string, Linha>; total: Linha }>();
    for (const l of linhas) {
      const vazio = (tipo: string): Linha => ({ dia: "", fornecedor: l.fornecedor, tipo, qtd: 0, valor_funcionario: 0, valor_empresa: 0 });
      const f = mapa.get(l.fornecedor) ?? {
        tipos: [] as string[],
        dias: new Map<string, Map<string, Linha>>(),
        totalPorTipo: new Map<string, Linha>(),
        total: vazio(""),
      };
      if (!f.tipos.includes(l.tipo)) f.tipos.push(l.tipo);
      const dia = f.dias.get(l.dia) ?? new Map();
      dia.set(l.tipo, l);
      f.dias.set(l.dia, dia);
      const t = f.totalPorTipo.get(l.tipo) ?? vazio(l.tipo);
      for (const alvo of [t, f.total]) {
        alvo.qtd += l.qtd;
        alvo.valor_funcionario += l.valor_funcionario;
        alvo.valor_empresa += l.valor_empresa;
      }
      f.totalPorTipo.set(l.tipo, t);
      mapa.set(l.fornecedor, f);
    }
    for (const f of mapa.values()) f.tipos.sort();
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [linhas]);

  const exportar = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      for (const [fornecedor, f] of porFornecedor) {
        const ws = wb.addWorksheet(fornecedor.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
        ws.addRow([`${fornecedor} — ${periodo?.rotulo ?? ""}`]).font = { bold: true, size: 13 };
        ws.addRow([]);
        ws.addRow(["Dia", ...f.tipos, "Total do dia"]).font = { bold: true };
        for (const [dia, tipos] of [...f.dias.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const qtds = f.tipos.map((t) => tipos.get(t)?.qtd ?? 0);
          ws.addRow([diaBR(dia), ...qtds, qtds.reduce((s, n) => s + n, 0)]);
        }
        ws.addRow(["Quantidade", ...f.tipos.map((t) => f.totalPorTipo.get(t)?.qtd ?? 0), f.total.qtd]).font = { bold: true };
        ws.addRow([]);
        ws.addRow(["Tipo", "Quantidade", "Funcionário paga", "Empresa paga", "Total"]).font = { bold: true };
        for (const t of f.tipos) {
          const x = f.totalPorTipo.get(t)!;
          const r = ws.addRow([t, x.qtd, x.valor_funcionario, x.valor_empresa, x.valor_funcionario + x.valor_empresa]);
          for (const c of [3, 4, 5]) r.getCell(c).numFmt = '"R$" #,##0.00';
        }
        const tot = ws.addRow(["TOTAL", f.total.qtd, f.total.valor_funcionario, f.total.valor_empresa, f.total.valor_funcionario + f.total.valor_empresa]);
        tot.font = { bold: true };
        for (const c of [3, 4, 5]) tot.getCell(c).numFmt = '"R$" #,##0.00';
        ws.getColumn(1).width = 18;
        for (let c = 2; c <= f.tipos.length + 2; c++) ws.getColumn(c).width = 16;
      }
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `conferencia-fornecedor-${periodo?.slug ?? "periodo"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar o Excel");
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Quantidade de marmitas por dia e por tipo, para conferir a nota fiscal de cada fornecedor.
      </p>
      <SeletorPeriodo onChange={setPeriodo} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {cancelados > 0 ? `${cancelados} lançamento(s) cancelado(s) no período — fora da conferência.` : " "}
        </p>
        <Button variant="outline" onClick={exportar} disabled={!linhas.length}>
          <Download className="h-4 w-4 mr-1" /> Excel
        </Button>
      </div>

      {carregando ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : porFornecedor.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhuma retirada no período.</p>
      ) : (
        porFornecedor.map(([fornecedor, f]) => (
          <section key={fornecedor} className="bg-card rounded-lg p-4 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold uppercase tracking-[.6px]">{fornecedor}</h2>
              <span className="text-sm text-muted-foreground">
                {f.total.qtd} marmitas · total {brl(f.total.valor_funcionario + f.total.valor_empresa)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Dia</th>
                    {f.tipos.map((t) => (
                      <th key={t} className="px-3 py-2 text-right">
                        {t}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...f.dias.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([dia, tipos]) => {
                      const qtds = f.tipos.map((t) => tipos.get(t)?.qtd ?? 0);
                      return (
                        <tr key={dia} className="border-t">
                          <td className="px-3 py-1.5 first-cap">{diaBR(dia)}</td>
                          {qtds.map((q, i) => (
                            <td key={f.tipos[i]} className={`px-3 py-1.5 text-right ${q ? "" : "text-muted-foreground"}`}>
                              {q}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold">{qtds.reduce((s, n) => s + n, 0)}</td>
                        </tr>
                      );
                    })}
                  <tr className="border-t-2 font-bold">
                    <td className="px-3 py-2">Quantidade</td>
                    {f.tipos.map((t) => (
                      <td key={t} className="px-3 py-2 text-right">
                        {f.totalPorTipo.get(t)?.qtd ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">{f.total.qtd}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Funcionário paga</th>
                    <th className="px-3 py-2 text-right">Empresa paga</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...f.tipos.map((t) => f.totalPorTipo.get(t)!), { ...f.total, tipo: "TOTAL" }].map((x) => (
                    <tr key={x.tipo} className={`border-t ${x.tipo === "TOTAL" ? "font-bold border-t-2" : ""}`}>
                      <td className="px-3 py-1.5">{x.tipo}</td>
                      <td className="px-3 py-1.5 text-right">{x.qtd}</td>
                      <td className="px-3 py-1.5 text-right">{brl(x.valor_funcionario)}</td>
                      <td className="px-3 py-1.5 text-right">{brl(x.valor_empresa)}</td>
                      <td className="px-3 py-1.5 text-right">{brl(x.valor_funcionario + x.valor_empresa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
