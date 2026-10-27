import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown, FileText, Download } from "lucide-react";
import { mapaLinhasPorPedido, valorItem, normalizarFornecedor } from "@/lib/analise-compras";

const FORA = new Set(["CANCELADA", "CANCELADA_SUPERVISOR", "REPROVADA", "PEDIDO_REPROVADO_GESTAO"]);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fd = (v?: string | null) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

type Linha = { id: string; maq: string; modelo: string; data: string; os: string; rc: string; pedido: string; codigo: string; descricao: string; qtd: number; fornecedor: string; valor: number };

export default function CustoEquipamento({ fonte }: { fonte: any[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");

  const linhas = useMemo<Linha[]>(() => {
    const comPedido = fonte.filter((s) => s.numero_pedido_compra && !FORA.has(s.status));
    const lpp = mapaLinhasPorPedido(comPedido);
    return comPedido.map((s) => ({
      id: s.id,
      maq: s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "SEM MÁQUINA",
      modelo: s.equipamento?.modelo || s.equipamento?.descricao || "",
      data: s.pedido?.comprador_at || s.aprovador_gestao_at || s.created_at,
      os: s.os_numero ?? "", rc: s.rc_numero ?? "", pedido: s.numero_pedido_compra ?? "",
      codigo: s.codigo_peca ?? "", descricao: s.descricao ?? "", qtd: Number(s.quantidade || 0),
      fornecedor: normalizarFornecedor(s.pedido?.fornecedor ?? s.fornecedor),
      valor: valorItem(s, lpp),
    }));
  }, [fonte]);

  const maquinas = useMemo(() => [...new Set(linhas.map((l) => l.maq))].sort(), [linhas]);

  const filtradas = useMemo(() => linhas.filter((l) => {
    if (sel.length && !sel.includes(l.maq)) return false;
    const d = (l.data ?? "").slice(0, 10);
    if (ini && d < ini) return false;
    if (fim && d > fim) return false;
    return true;
  }), [linhas, sel, ini, fim]);

  const resumo = useMemo(() => {
    const m = new Map<string, { maq: string; modelo: string; valor: number; qtd: number; itens: number; pedidos: Set<string>; os: Set<string>; linhas: Linha[] }>();
    for (const l of filtradas) {
      const c = m.get(l.maq) ?? { maq: l.maq, modelo: l.modelo, valor: 0, qtd: 0, itens: 0, pedidos: new Set(), os: new Set(), linhas: [] };
      c.valor += l.valor; c.qtd += l.qtd; c.itens++; c.pedidos.add(l.pedido); c.os.add(l.os); c.linhas.push(l);
      m.set(l.maq, c);
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [filtradas]);
  const total = resumo.reduce((n, r) => n + r.valor, 0);

  const termos = busca.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const opcoes = termos.length ? maquinas.filter((o) => termos.some((t) => o.toLowerCase().includes(t))) : maquinas;
  const alterna = (o: string) => setSel(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  const periodo = ini || fim ? `${ini ? fd(ini) : "início"} a ${fim ? fd(fim) : "hoje"}` : "todo o período";

  const pdf = (detalhado: boolean) => {
    const cab = `<table><thead><tr><th>MÁQUINA</th><th>MODELO</th><th>PEDIDOS</th><th>OS</th><th>ITENS</th><th>PEÇAS</th><th>% DO TOTAL</th><th class="r">CUSTO</th></tr></thead><tbody>
      ${resumo.map((r) => `<tr><td><b>${esc(r.maq)}</b></td><td>${esc(r.modelo)}</td><td>${r.pedidos.size}</td><td>${r.os.size}</td><td>${r.itens}</td><td>${r.qtd}</td><td>${total ? ((r.valor / total) * 100).toFixed(1) : 0}%</td><td class="r"><b>${brl(r.valor)}</b></td></tr>`).join("")}
      <tr class="tot"><td colspan="7">TOTAL</td><td class="r">${brl(total)}</td></tr></tbody></table>`;
    const det = detalhado ? resumo.map((r) => `<h2>${esc(r.maq)} ${r.modelo ? "· " + esc(r.modelo) : ""} — ${brl(r.valor)}</h2>
      <table><thead><tr><th>DATA</th><th>OS</th><th>RC</th><th>PEDIDO</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QTD</th><th>FORNECEDOR</th><th class="r">VALOR</th></tr></thead><tbody>
      ${[...r.linhas].sort((a, b) => (a.data < b.data ? -1 : 1)).map((l) => `<tr><td>${fd(l.data)}</td><td>${esc(l.os)}</td><td>${esc(l.rc)}</td><td>${esc(l.pedido)}</td><td>${esc(l.codigo)}</td><td>${esc(l.descricao)}</td><td>${l.qtd}</td><td>${esc(l.fornecedor)}</td><td class="r">${brl(l.valor)}</td></tr>`).join("")}
      <tr class="tot"><td colspan="8">Subtotal</td><td class="r">${brl(r.valor)}</td></tr></tbody></table>`).join("") : "";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Custo por equipamento</title>
      <style>body{font-family:Arial,sans-serif;margin:20px;color:#1f2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px;color:#3b528b}p{font-size:11px;color:#5a6270}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.kpi{background:#fffdf0;border:1px solid #ece6cf;border-top:4px solid #21918c;border-radius:8px;padding:8px 10px}.kt{font-size:9px;text-transform:uppercase;color:#5a6270}.kv{font-size:18px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:9px}th{background:#21918c;color:#fff;text-align:left;padding:4px}td{border-bottom:1px solid #e6e9ee;padding:3px 4px;vertical-align:top}.r{text-align:right}tr.tot td{font-weight:700;background:#eef6f5}tr{page-break-inside:avoid}@page{size:A4 landscape;margin:10mm}</style></head><body>
      <h1>Custo por equipamento${detalhado ? " — detalhado" : ""}</h1><p>Período: ${periodo} · Máquinas: ${sel.length ? esc(sel.join(", ")) : "todas"} · Gerado em ${new Date().toLocaleString("pt-BR")}. Considera peças com pedido, sem canceladas/rejeitadas.</p>
      <div class="kpis"><div class="kpi"><div class="kt">Custo total</div><div class="kv">${brl(total)}</div></div><div class="kpi"><div class="kt">Máquinas</div><div class="kv">${resumo.length}</div></div><div class="kpi"><div class="kt">Pedidos</div><div class="kv">${new Set(filtradas.map((l) => l.pedido)).size}</div></div><div class="kpi"><div class="kt">Custo médio por máquina</div><div class="kv">${brl(resumo.length ? total / resumo.length : 0)}</div></div></div>
      ${cab}${det}<script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const csv = () => {
    const rows = [["Máquina", "Modelo", "Data", "OS", "RC", "Pedido", "Código", "Descrição", "Qtd", "Fornecedor", "Valor"],
      ...filtradas.map((l) => [l.maq, l.modelo, fd(l.data), l.os, l.rc, l.pedido, l.codigo, l.descricao, l.qtd, l.fornecedor, l.valor.toFixed(2).replace(".", ",")])];
    const txt = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = `custo-por-equipamento-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Custo por equipamento</CardTitle>
          <CardDescription>Peças com pedido (sem canceladas/rejeitadas) · {periodo} · total {brl(total)}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => pdf(false)}><FileText className="mr-1 h-4 w-4" /> PDF resumido</Button>
          <Button size="sm" onClick={() => pdf(true)}><FileText className="mr-1 h-4 w-4" /> PDF detalhado</Button>
          <Button size="sm" variant="outline" onClick={csv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Máquinas</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-[220px] justify-between">
                  <span className="truncate">{sel.length ? `${sel.length} selecionada(s)` : "Todas as máquinas"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-2">
                <Input placeholder="Separe por vírgula: EG 170, EG 200" value={busca} onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setSel([...new Set([...sel, ...opcoes])]); setBusca(""); } }} className="mb-2 h-8" />
                {termos.length > 0 && opcoes.length > 0 && (
                  <Button variant="secondary" size="sm" className="mb-2 w-full text-xs" onClick={() => setSel([...new Set([...sel, ...opcoes])])}>Marcar os {opcoes.length} encontrados</Button>
                )}
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {opcoes.map((o) => (
                    <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={sel.includes(o)} onCheckedChange={() => alterna(o)} /> <span className="truncate">{o}</span>
                    </label>
                  ))}
                </div>
                {sel.length > 0 && <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setSel([])}>Limpar seleção</Button>}
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1"><Label className="text-xs">De</Label><Input type="date" className="h-9" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">Até</Label><Input type="date" className="h-9" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
        </div>
        {sel.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sel.map((s) => <button key={s} type="button" onClick={() => alterna(s)} className="rounded-full border bg-muted px-2 py-0.5 text-[11px] hover:bg-destructive/10">{s} ×</button>)}
          </div>
        )}
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr><th className="py-2">Máquina</th><th>Modelo</th><th>Pedidos</th><th>Itens</th><th>Peças</th><th>%</th><th className="text-right">Custo</th></tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.maq} className="border-t">
                  <td className="py-1.5 font-semibold">{r.maq}</td><td className="text-xs">{r.modelo}</td><td>{r.pedidos.size}</td><td>{r.itens}</td><td>{r.qtd}</td>
                  <td>{total ? ((r.valor / total) * 100).toFixed(1) : 0}%</td><td className="text-right font-semibold">{brl(r.valor)}</td>
                </tr>
              ))}
              {resumo.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhum custo no filtro escolhido.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
