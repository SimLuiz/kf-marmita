import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorio")({
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
  supplier: string;
  meal: string;
  price: number;
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

function Page() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sigUrls, setSigUrls] = useState<Record<string, string>>({});

  const range = useMemo(() => {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [cursor]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const [emps, sups, mts, recs] = await Promise.all([
        supabase.from("employees").select("id,name,cpf,company"),
        supabase.from("suppliers").select("id,name"),
        supabase.from("meal_types").select("id,supplier_id,name,price"),
        supabase
          .from("meal_records")
          .select("id,employee_id,meal_type_id,photo_path,taken_at")
          .gte("taken_at", range.start.toISOString())
          .lt("taken_at", range.end.toISOString())
          .order("taken_at", { ascending: false }),
      ]);

      const empMap = new Map<string, any>((emps.data ?? []).map((e: any) => [e.id, e]));
      const supMap = new Map<string, any>((sups.data ?? []).map((s: any) => [s.id, s]));
      const mtMap = new Map<string, any>(
        (mts.data ?? []).map((t: any) => [t.id, { ...t, price: Number(t.price) }])
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
          supplier: sup?.name ?? "—",
          meal: mt?.name ?? "(não informada)",
          price: mt ? Number(mt.price) : 0,
          taken_at: r.taken_at,
          photo_path: r.photo_path ?? null,
        });
      });

      setRows(list);

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

  const totalCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + r.price, 0);
  const monthName = monthLabel(cursor);

  // grouped per employee for on-screen display
  const byEmployee = useMemo(() => {
    const m = new Map<string, { row: DetailRow; items: DetailRow[]; count: number; total: number }>();
    rows.forEach((r) => {
      const g = m.get(r.employee_id);
      if (g) {
        g.items.push(r);
        g.count += 1;
        g.total += r.price;
      } else {
        m.set(r.employee_id, { row: r, items: [r], count: 1, total: r.price });
      }
    });
    return Array.from(m.values());
  }, [rows]);

  const exportCSV = () => {
    const q = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const header =
      "Funcionário;CPF;Empresa;Fornecedor;Marmita;Data/hora;Valor\n";
    const body = rows
      .map(
        (r) =>
          `${q(r.name)};${q(r.cpf)};${q(r.company)};${q(r.supplier)};${q(r.meal)};${q(fmtDateTime(r.taken_at))};${n(r.price)}`
      )
      .join("\n");
    const csv =
      "\uFEFF" +
      header +
      body +
      `\n;;;;;;\nTOTAL;;;;;${totalCount};${n(totalValue)}\n`;
    download(csv, `relatorio-${monthName.replace(/\s/g, "-")}.csv`, "text/csv;charset=utf-8");
  };

  const exportPDF = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${monthName}</title>
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
<div class="sub">${monthName}</div>
<table><thead><tr>
<th>Funcionário</th><th>CPF</th><th>Empresa</th><th>Fornecedor</th><th>Marmita</th>
<th>Data/hora</th><th class="num">Valor</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) =>
      `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.cpf ?? "—")}</td><td>${escapeHtml(r.company ?? "—")}</td><td>${escapeHtml(r.supplier)}</td><td>${escapeHtml(r.meal)}</td><td>${escapeHtml(fmtDateTime(r.taken_at))}</td><td class="num">${brl(r.price)}</td></tr>`
  )
  .join("")}
<tr class="total"><td colspan="6">TOTAL (${totalCount})</td><td class="num">${brl(totalValue)}</td></tr>
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
        className="bg-card rounded-2xl p-3 flex items-center justify-between"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
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
        <div className="font-semibold capitalize">{monthName}</div>
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

      <div className="grid grid-cols-2 gap-3">
        <div
          className="bg-card rounded-2xl p-4 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Marmitas</div>
          <div className="text-3xl font-bold text-primary">{totalCount}</div>
        </div>
        <div
          className="bg-card rounded-2xl p-4 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor total</div>
          <div className="text-2xl font-bold text-primary">{brl(totalValue)}</div>
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
              className="bg-card rounded-2xl p-4 space-y-2"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground shrink-0">
                    {g.row.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.row.name}</div>
                    {g.row.company && (
                      <div className="text-xs text-muted-foreground truncate">
                        {g.row.company}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-primary">{brl(g.total)}</div>
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
