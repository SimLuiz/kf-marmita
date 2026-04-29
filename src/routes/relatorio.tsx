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

interface Row {
  employee_id: string;
  name: string;
  count: number;
}

const monthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

function Page() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

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
      const [{ data: emps }, { data: recs }] = await Promise.all([
        supabase.from("employees").select("id,name").order("name"),
        supabase
          .from("meal_records")
          .select("employee_id")
          .gte("taken_at", range.start.toISOString())
          .lt("taken_at", range.end.toISOString()),
      ]);
      const counts = new Map<string, number>();
      (recs ?? []).forEach((r) => {
        counts.set(r.employee_id, (counts.get(r.employee_id) ?? 0) + 1);
      });
      const merged: Row[] = (emps ?? []).map((e) => ({
        employee_id: e.id,
        name: e.name,
        count: counts.get(e.id) ?? 0,
      }));
      merged.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      setRows(merged);
      setLoading(false);
    })();
  }, [user, range.start, range.end]);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const monthName = monthLabel(cursor);

  const exportCSV = () => {
    const header = "Funcionário;Marmitas\n";
    const body = rows.map((r) => `"${r.name.replace(/"/g, '""')}";${r.count}`).join("\n");
    const csv = "\uFEFF" + header + body + `\n;\nTotal;${total}\n`;
    download(csv, `relatorio-${monthName.replace(/\s/g, "-")}.csv`, "text/csv;charset=utf-8");
  };

  const exportPDF = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${monthName}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#222}
h1{margin:0 0 4px;font-size:22px}
.sub{color:#666;margin-bottom:24px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e5e5e5}
th{background:#fafafa;font-size:13px;text-transform:uppercase;letter-spacing:.5px}
tr:last-child td{font-weight:bold;border-top:2px solid #222;border-bottom:none}
td.num,th.num{text-align:right}
@media print{button{display:none}}
</style></head><body>
<h1>Relatório de Marmitas</h1>
<div class="sub">${monthName}</div>
<table><thead><tr><th>Funcionário</th><th class="num">Marmitas</th></tr></thead>
<tbody>
${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.count}</td></tr>`).join("")}
<tr><td>TOTAL</td><td class="num">${total}</td></tr>
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
        <p className="text-sm text-muted-foreground">Fechamento por funcionário</p>
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

      <div
        className="bg-card rounded-2xl p-5 text-center"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Total de marmitas</div>
        <div className="text-4xl font-bold text-primary">{total}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button onClick={exportPDF} disabled={rows.length === 0}>
          <FileText className="h-4 w-4 mr-1" /> PDF
        </Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Cadastre funcionários para ver o relatório.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.employee_id}
              className="bg-card rounded-xl p-4 flex items-center justify-between"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-semibold text-accent-foreground">
                  {r.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{r.name}</span>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-primary">{r.count}</div>
                <div className="text-[10px] text-muted-foreground uppercase">marmitas</div>
              </div>
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
