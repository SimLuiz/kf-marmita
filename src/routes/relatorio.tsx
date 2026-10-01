import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { SeletorPeriodo, type Periodo } from "@/components/SeletorPeriodo";
import { relatorio, urlsDasAssinaturas } from "@/lib/dados.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatórios de marmitas | KF Marmita" },
      { name: "description", content: "Gere relatórios por período e exporte em Excel e PDF com setor, fornecedor e valores." },
      { property: "og:title", content: "Relatórios de marmitas | KF Marmita" },
      { property: "og:description", content: "Gere relatórios por período e exporte em Excel e PDF com setor, fornecedor e valores." },
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

interface DetailRow {
  id: string;
  employee_id: string;
  name: string;
  cpf: string | null;
  company: string | null;
  sector: string | null;
  supplier: string;
  meal: string;
  price: number;
  company_price: number;
  taken_at: string;
  photo_path: string | null;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
function Page() {
  const { user } = useAuth();
  // Competência (26 a 25, igual ao kf-rh) é o modo padrão — ver SeletorPeriodo.
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [allRows, setAllRows] = useState<DetailRow[]>([]);
  const [cancelados, setCancelados] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sigUrls, setSigUrls] = useState<Record<string, string>>({});

  const periodLabel = periodo?.rotulo ?? "";

  useEffect(() => {
    if (!user || !periodo) return;
    setLoading(true);
    (async () => {
      try {
        // A junção (funcionário, tipo, fornecedor) e as URLs das assinaturas
        // saem prontas do servidor. Cancelados ficam fora (só a contagem vem).
        const r = await relatorio({ data: { inicio: periodo.inicio.toISOString(), fim: periodo.fim.toISOString() } });
        setAllRows(r.linhas as DetailRow[]);
        setSigUrls(r.assinaturas);
        setCancelados(r.cancelados ?? 0);
      } catch (e) {
        toast.error("Não foi possível carregar o relatório");
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, periodo?.inicio.getTime(), periodo?.fim.getTime()]);

  // Todos os lançamentos do período entram no relatório — retiradas múltiplas
  // no mesmo dia (ou em sequência) são lançamentos legítimos.
  const rows = allRows;

  const totalCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + r.price, 0);
  const totalCompany = rows.reduce((s, r) => s + r.company_price, 0);
  const periodSlug = periodo?.slug ?? "periodo";

  // grouped per employee for on-screen display
  const byEmployee = useMemo(() => {
    const m = new Map<
      string,
      { row: DetailRow; items: DetailRow[]; count: number; total: number; totalCompany: number }
    >();
    rows.forEach((r) => {
      const g = m.get(r.employee_id);
      if (g) {
        g.items.push(r);
        g.count += 1;
        g.total += r.price;
        g.totalCompany += r.company_price;
      } else {
        m.set(r.employee_id, {
          row: r,
          items: [r],
          count: 1,
          total: r.price,
          totalCompany: r.company_price,
        });
      }
    });
    return Array.from(m.values());
  }, [rows]);

  const exportCSV = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(periodLabel.replace(/[\\/?*\[\]:]/g, "-").slice(0, 31));

      ws.columns = [
        { header: "Funcionário", key: "name", width: 28 },
        { header: "CPF", key: "cpf", width: 16 },
        { header: "Empresa", key: "company", width: 20 },
        { header: "Setor", key: "sector", width: 18 },
        { header: "Fornecedor", key: "supplier", width: 20 },
        { header: "Marmita", key: "meal", width: 20 },
        { header: "Data/hora", key: "taken_at", width: 16 },
        { header: "Funcionário paga", key: "price", width: 16 },
        { header: "Empresa paga", key: "company_price", width: 16 },
        { header: "Assinatura", key: "sig", width: 55 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).alignment = { vertical: "middle", horizontal: "left" };

      // Preload signed URLs and image bytes for every row that has a photo_path
      const uniquePaths = Array.from(new Set(rows.map((r) => r.photo_path).filter(Boolean) as string[]));
      const pathToBuf = new Map<string, { buf: ArrayBuffer; ext: "png" | "jpeg" }>();
      const urls = await urlsDasAssinaturas({ data: { caminhos: uniquePaths } });
      await Promise.all(
        uniquePaths.map(async (p) => {
          const url = urls[p];
          if (!url) return;
          try {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const ext: "png" | "jpeg" = p.toLowerCase().endsWith(".jpg") || p.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
            pathToBuf.set(p, { buf, ext });
          } catch {}
        })
      );

      const ROW_H = 130;
      const SIG_COL_INDEX = 9; // 0-based index for Assinatura (10th column)
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const row = ws.addRow({
          name: r.name,
          cpf: r.cpf ?? "",
          company: r.company ?? "",
          sector: r.sector ?? "",
          supplier: r.supplier,
          meal: r.meal,
          taken_at: fmtDateTime(r.taken_at),
          price: r.price,
          company_price: r.company_price,
          sig: "",
        });
        row.height = ROW_H;
        row.getCell("price").numFmt = '"R$" #,##0.00';
        row.getCell("company_price").numFmt = '"R$" #,##0.00';
        row.alignment = { vertical: "middle" };

        if (r.photo_path && pathToBuf.has(r.photo_path)) {
          const { buf, ext } = pathToBuf.get(r.photo_path)!;
          const imgId = wb.addImage({ buffer: buf as any, extension: ext });
          const excelRow = row.number - 1; // 0-based for anchor
          ws.addImage(imgId, {
            tl: { col: SIG_COL_INDEX + 0.05, row: excelRow + 0.05 } as any,
            br: { col: SIG_COL_INDEX + 0.95, row: excelRow + 0.95 } as any,
            editAs: "oneCell",
          });
        }
      }

      const totalRow = ws.addRow({
        name: `TOTAL (${totalCount})`,
        price: totalValue,
        company_price: totalCompany,
      });
      totalRow.font = { bold: true };
      totalRow.getCell("price").numFmt = '"R$" #,##0.00';
      totalRow.getCell("company_price").numFmt = '"R$" #,##0.00';

      const out = await wb.xlsx.writeBuffer();
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${periodSlug}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Falha ao gerar Excel");
      console.error(e);
    }
  };

  const exportPDF = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${periodLabel}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#222}
h1{margin:0 0 4px;font-size:22px}
.sub{color:#666;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e5e5e5}
th{background:#fafafa;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
tr.total td{font-weight:bold;border-top:2px solid #222;border-bottom:none;background:#fafafa}
td.num,th.num{text-align:right}
@media print{button{display:none}}
</style></head><body>
<h1>KF Baterias — Relatório de Marmitas</h1>
<div class="sub">${periodLabel}</div>
<h2 style="font-size:15px;margin:0 0 8px">Resumo por funcionário</h2>
<table style="margin-bottom:28px"><thead><tr>
<th>Funcionário</th><th>Empresa</th><th>Setor</th><th class="num">Marmitas</th>
<th class="num">Funcionário paga</th><th class="num">Empresa paga</th>
</tr></thead><tbody>
${byEmployee
  .map(
    (g) =>
      `<tr><td>${escapeHtml(g.row.name)}</td><td>${escapeHtml(g.row.company ?? "—")}</td><td>${escapeHtml(g.row.sector ?? "—")}</td><td class="num">${g.count}</td><td class="num">${brl(g.total)}</td><td class="num">${brl(g.totalCompany)}</td></tr>`
  )
  .join("")}
<tr class="total"><td colspan="3">TOTAL</td><td class="num">${totalCount}</td><td class="num">${brl(totalValue)}</td><td class="num">${brl(totalCompany)}</td></tr>
</tbody></table>
<h2 style="font-size:15px;margin:0 0 8px">Detalhamento</h2>
<table><thead><tr>
<th>Funcionário</th><th>CPF</th><th>Empresa</th><th>Setor</th><th>Fornecedor</th><th>Marmita</th>
<th>Data/hora</th><th class="num">Funcionário paga</th><th class="num">Empresa paga</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) =>
      `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.cpf ?? "—")}</td><td>${escapeHtml(r.company ?? "—")}</td><td>${escapeHtml(r.sector ?? "—")}</td><td>${escapeHtml(r.supplier)}</td><td>${escapeHtml(r.meal)}</td><td>${escapeHtml(fmtDateTime(r.taken_at))}</td><td class="num">${brl(r.price)}</td><td class="num">${brl(r.company_price)}</td></tr>`
  )
  .join("")}
<tr class="total"><td colspan="7">TOTAL (${totalCount})</td><td class="num">${brl(totalValue)}</td><td class="num">${brl(totalCompany)}</td></tr>
</tbody></table>
<button style="margin-top:24px;padding:10px 18px;font-size:14px" onclick="window.print()">Imprimir / Salvar PDF</button>
<script>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para gerar o PDF");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <SeletorPeriodo onChange={setPeriodo} />

      {cancelados > 0 && (
        <p className="text-xs text-muted-foreground">
          {cancelados} lançamento(s) cancelado(s) no período — fora dos totais e das exportações.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className="bg-card rounded-lg p-4 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Marmitas</div>
          <div className="text-3xl font-bold text-primary">{totalCount}</div>
        </div>
        <div
          className="bg-card rounded-lg p-4 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Funcionário paga</div>
          <div className="text-xl font-bold text-primary tabular-nums break-words">{brl(totalValue)}</div>
        </div>
        <div
          className="bg-card rounded-lg p-4 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Empresa paga</div>
          <div className="text-xl font-bold text-primary tabular-nums break-words">{brl(totalCompany)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Excel
        </Button>
        <Button onClick={exportPDF} disabled={rows.length === 0}>
          <FileText className="h-4 w-4 mr-1" /> PDF
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : byEmployee.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma retirada registrada neste mês.
          </p>
        ) : (
          byEmployee.map((g) => (
            <div
              key={g.row.employee_id}
              className="bg-card rounded-lg p-4 space-y-2"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground shrink-0">
                    {g.row.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.row.name}</div>
                    {(g.row.company || g.row.sector) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[g.row.company, g.row.sector].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-primary">{brl(g.total)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Empresa: {brl(g.totalCompany)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {g.count} marmita{g.count !== 1 && "s"}
                  </div>
                </div>
              </div>
              <div className="space-y-1 pt-1 border-t">
                {g.items.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0 truncate">
                      <span className="text-muted-foreground">{fmtDateTime(it.taken_at)}</span>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{it.supplier}</span>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <span className="font-medium">{it.meal}</span>
                    </div>
                    <div className="text-right shrink-0 text-muted-foreground">
                      <span className="font-semibold text-foreground">{brl(it.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {sigUrls[g.row.employee_id] && (
                <div className="pt-2 border-t">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Assinatura</div>
                  <img
                    src={sigUrls[g.row.employee_id]}
                    alt={`Assinatura de ${g.row.name}`}
                    className="w-full h-24 object-contain bg-white rounded-lg border border-border"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
