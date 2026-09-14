import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, FileText, CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatórios de marmitas | Marmita Control" },
      { name: "description", content: "Gere relatórios por período e exporte em Excel e PDF com setor, fornecedor e valores." },
      { property: "og:title", content: "Relatórios de marmitas | Marmita Control" },
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

const monthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
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
const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromInputDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
};

function Page() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"month" | "range">("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [allRows, setAllRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sigUrls, setSigUrls] = useState<Record<string, string>>({});

  const range = useMemo(() => {
    if (mode === "month") {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setMonth(end.getMonth() + 1);
      return { start, end };
    }
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1); // inclusive end day
    return { start, end };
  }, [mode, cursor, startDate, endDate]);

  const periodLabel = useMemo(() => {
    if (mode === "month") return monthLabel(cursor);
    const endInclusive = new Date(range.end);
    endInclusive.setDate(endInclusive.getDate() - 1);
    return `${fmtDate(startDate)} — ${fmtDate(endInclusive)}`;
  }, [mode, cursor, startDate, endDate, range.end]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const [emps, sups, mts, recs] = await Promise.all([
        fetchAllRows((f, t) =>
          (supabase as any).from("employees_view").select("id,name,cpf,company,sector").range(f, t)
        ),
        fetchAllRows((f, t) => supabase.from("suppliers").select("id,name").range(f, t)),
        fetchAllRows((f, t) =>
          (supabase as any).from("meal_types").select("id,supplier_id,name,price,company_price").range(f, t)
        ),
        fetchAllRows((f, t) =>
          (supabase as any)
            .from("meal_records")
            .select("id,employee_id,meal_type_id,photo_path,taken_at,unit_price,company_unit_price")
            .gte("taken_at", range.start.toISOString())
            .lt("taken_at", range.end.toISOString())
            .order("taken_at", { ascending: false })
            .order("id", { ascending: false })
            .range(f, t)
        ),
      ]);

      const empMap = new Map<string, any>((emps.data ?? []).map((e: any) => [e.id, e]));
      const supMap = new Map<string, any>((sups.data ?? []).map((s: any) => [s.id, s]));
      const mtMap = new Map<string, any>(
        (mts.data ?? []).map((t: any) => [
          t.id,
          { ...t, price: Number(t.price), company_price: Number(t.company_price ?? 0) },
        ])
      );

      const list: DetailRow[] = [];
      (recs.data ?? []).forEach((r: any) => {
        const emp = empMap.get(r.employee_id);
        if (!emp) return;
        const mt = r.meal_type_id ? mtMap.get(r.meal_type_id) : null;
        const sup = mt ? supMap.get(mt.supplier_id) : null;
        list.push({
          id: r.id,
          employee_id: emp.id,
          name: emp.name,
          cpf: emp.cpf ?? null,
          company: emp.company ?? null,
          sector: emp.sector ?? null,
          supplier: sup?.name ?? "—",
          meal: mt?.name ?? "(não informada)",
          price: r.unit_price != null ? Number(r.unit_price) : mt ? Number(mt.price) : 0,
          company_price:
            r.company_unit_price != null
              ? Number(r.company_unit_price)
              : mt
                ? Number(mt.company_price)
                : 0,
          taken_at: r.taken_at,
          photo_path: r.photo_path ?? null,
        });
      });

      setAllRows(list);

      // Build signed URLs for the first signature per employee
      const uniquePaths = new Map<string, string>();
      list.forEach((r) => {
        if (r.photo_path && !uniquePaths.has(r.employee_id)) {
          uniquePaths.set(r.employee_id, r.photo_path);
        }
      });
      const urlMap: Record<string, string> = {};
      await Promise.all(
        Array.from(uniquePaths.entries()).map(async ([empId, path]) => {
          const { data } = await supabase.storage
            .from("meal-photos")
            .createSignedUrl(path, 60 * 60 * 24);
          if (data?.signedUrl) urlMap[empId] = data.signedUrl;
        })
      );
      setSigUrls(urlMap);

      setLoading(false);
    })();
  }, [user, range.start, range.end]);

  // Todos os lançamentos do período entram no relatório — retiradas múltiplas
  // no mesmo dia (ou em sequência) são lançamentos legítimos.
  const rows = allRows;

  const totalCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + r.price, 0);
  const totalCompany = rows.reduce((s, r) => s + r.company_price, 0);
  const periodSlug = periodLabel.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

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
      await Promise.all(
        uniquePaths.map(async (p) => {
          const { data } = await supabase.storage.from("meal-photos").createSignedUrl(p, 60 * 60);
          if (!data?.signedUrl) return;
          try {
            const res = await fetch(data.signedUrl);
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
<h1>Relatório de Marmitas</h1>
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
      <div>
        <h2 className="text-2xl font-bold">Relatório mensal</h2>
        <p className="text-sm text-muted-foreground">Fechamento por funcionário e marmita</p>
      </div>

      <div
        className="bg-card rounded-lg p-3 space-y-3"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("month")}
          >
            Por mês
          </Button>
          <Button
            variant={mode === "range" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("range")}
          >
            <CalendarRange className="h-4 w-4 mr-1" /> Por período
          </Button>
        </div>

        {mode === "month" ? (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() - 1);
                setCursor(d);
              }}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="font-semibold first-cap">{periodLabel}</div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() + 1);
                setCursor(d);
              }}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground space-y-1">
                <span>De</span>
                <Input
                  type="date"
                  value={toInputDate(startDate)}
                  max={toInputDate(endDate)}
                  onChange={(e) => e.target.value && setStartDate(fromInputDate(e.target.value))}
                />
              </label>
              <label className="text-xs text-muted-foreground space-y-1">
                <span>Até</span>
                <Input
                  type="date"
                  value={toInputDate(endDate)}
                  min={toInputDate(startDate)}
                  onChange={(e) => e.target.value && setEndDate(fromInputDate(e.target.value))}
                />
              </label>
            </div>
            <div className="text-center text-sm font-semibold">{periodLabel}</div>
          </div>
        )}
      </div>


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
