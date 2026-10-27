import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSolicitacoes } from "@/lib/solicitacoes.functions";
import { isRcSemPedido } from "@/lib/fases";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VIRIDIS, VIRIDIS_ACCENT, VIRIDIS_PRIMARY, VIRIDIS_SECONDARY, viridisAt } from "@/lib/viridis";
import { tipoPecaDe } from "@/lib/analise-compras";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, AlertTriangle, Layers, Wrench, Clock, FileText, ChevronsUpDown, ListFilter } from "lucide-react";
import CustoEquipamento from "@/components/CustoEquipamento";

type Item = {
  id: string;
  status: string;
  os_numero: string;
  quantidade: number;
  descricao: string;
  codigo_peca: string | null;
  rc_numero: string | null;
  em_cadastro?: boolean | null;
  numero_pedido_compra: string | null;
  created_at: string;
  pcm_at: string | null;
  equipamento: { prefixo_interno: string | null; codigo_armac: string | null; descricao: string | null } | null;
};

// Mesma regra usada no Acompanhamento do PCM
const rcTratada = (s: Item) => isRcSemPedido(s);

const DIA = 86400000;
const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DIA) : 0);
const fmtMes = (iso: string) => iso.slice(0, 7);

export default function PainelGestorTab({ items }: { items?: Item[] }) {
  const [slaDias, setSlaDias] = useState(7);
  const listSolic = useServerFn(listSolicitacoes);
  const { data: buscados = [] } = useQuery({
    queryKey: ["painel-gestor-rcs"],
    queryFn: () => listSolic({ data: { limit: 5000 } }),
    refetchInterval: 60000,
    enabled: !items,
  });
  const fonte = (items ?? buscados) as Item[];

  const base = useMemo(() => fonte.filter((s) => isRcSemPedido(s)), [fonte]);

  const comIdade = useMemo(
    () => base.map((s) => ({ ...s, idade: dias(s.pcm_at ?? s.created_at) })).sort((a, b) => b.idade - a.idade),
    [base],
  );

  const kpis = useMemo(() => {
    const rcs = new Set(comIdade.map((s) => s.rc_numero!.trim().toUpperCase()));
    const eqs = new Set(
      comIdade.map((s) => s.equipamento?.prefixo_interno ?? s.equipamento?.codigo_armac ?? "—"),
    );
    const oss = new Set(comIdade.map((s) => s.os_numero));
    const pecas = comIdade.reduce((a, s) => a + (Number(s.quantidade) || 0), 0);
    const idades = comIdade.map((s) => s.idade);
    const medio = idades.length ? idades.reduce((a, b) => a + b, 0) / idades.length : 0;
    const pior = idades.length ? Math.max(...idades) : 0;
    const atrasadas = comIdade.filter((s) => s.idade > slaDias);
    const rcsAtrasadas = new Set(atrasadas.map((s) => s.rc_numero!.trim().toUpperCase()));
    return {
      linhas: comIdade.length,
      rcs: rcs.size,
      eqs: eqs.size,
      oss: oss.size,
      pecas,
      medio,
      pior,
      atrasadas: atrasadas.length,
      rcsAtrasadas: rcsAtrasadas.size,
      pctAtraso: comIdade.length ? (atrasadas.length / comIdade.length) * 100 : 0,
    };
  }, [comIdade, slaDias]);

  const aprov = useMemo(() => {
    const itens = fonte.filter(
      (s) => String(s.status).startsWith("PEDIDO_EM_APROVACAO") && !!s.numero_pedido_compra?.trim(),
    );
    const m = new Map<string, { status: string; idade: number }>();
    for (const s of itens) {
      const k = s.numero_pedido_compra!.trim().toUpperCase();
      const idade = dias((s as any).aprovador_gestao_at ?? s.pcm_at ?? s.created_at);
      const cur = m.get(k);
      if (!cur || idade > cur.idade) m.set(k, { status: s.status, idade });
    }
    const vals = [...m.values()];
    const idades = vals.map((v) => v.idade);
    return {
      linhas: itens.length,
      pecas: itens.reduce((a, s) => a + (Number(s.quantidade) || 0), 0),
      pedidos: m.size,
      coord: vals.filter((v) => v.status === "PEDIDO_EM_APROVACAO_COORD").length,
      ger: vals.filter((v) => v.status === "PEDIDO_EM_APROVACAO_GERENTE").length,
      dir: vals.filter((v) => v.status === "PEDIDO_EM_APROVACAO_DIRETORIA").length,
      medio: idades.length ? idades.reduce((a, b) => a + b, 0) / idades.length : 0,
      pior: idades.length ? Math.max(...idades) : 0,
      atrasados: idades.filter((d) => d >= 1).length,
    };
  }, [fonte]);

  const aging = useMemo(() => {
    const faixas = [
      { nome: "0–3 dias", min: 0, max: 3 },
      { nome: "3–7 dias", min: 3, max: 7 },
      { nome: "7–15 dias", min: 7, max: 15 },
      { nome: "15–30 dias", min: 15, max: 30 },
      { nome: "+30 dias", min: 30, max: Infinity },
    ];
    return faixas.map((f) => {
      const grupo = comIdade.filter((s) => s.idade >= f.min && s.idade < f.max);
      return {
        nome: f.nome,
        itens: grupo.length,
        rcs: new Set(grupo.map((s) => s.rc_numero!.trim().toUpperCase())).size,
      };
    });
  }, [comIdade]);

  const topEquip = useMemo(() => {
    const m = new Map<string, { nome: string; itens: number; rcs: Set<string>; pior: number }>();
    for (const s of comIdade) {
      const nome = s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "SEM MÁQUINA";
      const cur = m.get(nome) ?? { nome, itens: 0, rcs: new Set<string>(), pior: 0 };
      cur.itens += 1;
      cur.rcs.add(s.rc_numero!.trim().toUpperCase());
      cur.pior = Math.max(cur.pior, s.idade);
      m.set(nome, cur);
    }
    return [...m.values()]
      .map((x) => ({ nome: x.nome, itens: x.itens, rcs: x.rcs.size, pior: x.pior }))
      .sort((a, b) => b.pior - a.pior || b.itens - a.itens)
      .slice(0, 10);
  }, [comIdade]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of comIdade) {
      const t = tipoPecaDe(s.descricao ?? "");
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [comIdade]);

  const evolucao = useMemo(() => {
    const m = new Map<string, { mes: string; itens: number; rcs: Set<string> }>();
    for (const s of comIdade) {
      const mes = fmtMes(s.pcm_at ?? s.created_at);
      const cur = m.get(mes) ?? { mes, itens: 0, rcs: new Set<string>() };
      cur.itens += 1;
      cur.rcs.add(s.rc_numero!.trim().toUpperCase());
      m.set(mes, cur);
    }
    return [...m.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
      .map((x) => ({ mes: x.mes, itens: x.itens, rcs: x.rcs.size }));
  }, [comIdade]);

  const porRc = useMemo(() => {
    const m = new Map<string, { rc: string; itens: number; idade: number; maquinas: Set<string>; os: Set<string> }>();
    for (const s of comIdade) {
      const rc = s.rc_numero!.trim().toUpperCase();
      const cur = m.get(rc) ?? { rc, itens: 0, idade: 0, maquinas: new Set<string>(), os: new Set<string>() };
      cur.itens += 1;
      cur.idade = Math.max(cur.idade, s.idade);
      cur.maquinas.add(s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "—");
      cur.os.add(s.os_numero);
      m.set(rc, cur);
    }
    return [...m.values()].sort((a, b) => b.idade - a.idade);
  }, [comIdade]);

  const baixarCsv = () => {
    const linhas = [
      ["RC", "Dias em aberto", "Itens", "Máquinas", "OS"].join(";"),
      ...porRc.map((r) => [r.rc, r.idade, r.itens, [...r.maquinas].join(" / "), [...r.os].join(" / ")].join(";")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rcs-sem-tratativa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const baixarCsvItens = () => {
    const linhas = [
      ["RC", "OS", "MÁQUINA", "CÓDIGO", "DESCRIÇÃO", "QTD", "STATUS", "DIAS EM ABERTO", "DATA"].join(";"),
      ...comIdade.map((s) =>
        [
          s.rc_numero ?? "",
          s.os_numero ?? "",
          s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "",
          s.codigo_peca ?? "",
          (s.descricao ?? "").replace(/;/g, ","),
          s.quantidade,
          s.status,
          s.idade,
          new Date(s.pcm_at ?? s.created_at).toLocaleDateString("pt-BR"),
        ].join(";"),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `requisicoes-em-aberto-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gerarPdf = () => {
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
    const linhas = comIdade
      .map(
        (s) => `<tr${s.idade > slaDias ? ' class="atraso"' : ""}>
        <td>${esc(s.rc_numero)}</td><td>${esc(s.os_numero)}</td>
        <td>${esc(s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "")}</td>
        <td>${esc(s.codigo_peca)}</td><td>${esc(s.descricao)}</td>
        <td style="text-align:center">${esc(s.quantidade)}</td>
        <td style="text-align:center">${s.idade}d</td>
        <td>${new Date(s.pcm_at ?? s.created_at).toLocaleDateString("pt-BR")}</td>
      </tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Requisições em aberto</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#1f2430}
        h1{font-size:18px;margin:0 0 4px}
        p.sub{margin:0 0 14px;font-size:12px;color:#5a6270}
        .kpis{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
        .kpi{border:1px solid #d8dce3;border-top:3px solid #21918c;padding:8px 12px;border-radius:6px}
        .kpi b{display:block;font-size:18px}
        .kpi span{font-size:10px;letter-spacing:.06em;color:#5a6270}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th{background:#21918c;color:#fff;text-align:left;padding:5px}
        td{border-bottom:1px solid #e6e9ee;padding:4px 5px}
        tr.atraso td{background:#fdecef}
        @page{size:A4 landscape;margin:12mm}
      </style></head><body>
      <h1>Requisições em aberto — sem tratativa</h1>
      <p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · SLA ${slaDias} dias</p>
      <div class="kpis">
        <div class="kpi"><span>REQUISIÇÕES TOTAIS</span><b>${kpis.linhas}</b></div>
        <div class="kpi"><span>RCs ÚNICAS</span><b>${kpis.rcs}</b></div>
        <div class="kpi"><span>EQUIPAMENTOS</span><b>${kpis.eqs}</b></div>
        <div class="kpi"><span>ESPERA MÉDIA</span><b>${kpis.medio.toFixed(1)}d</b></div>
        <div class="kpi"><span>ACIMA DO SLA</span><b>${kpis.atrasadas}</b></div>
      </div>
      <table><thead><tr><th>RC</th><th>OS</th><th>Máquina</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>Dias</th><th>Data</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Painel do Gestor — RCs sem tratativa</h2>
          <p className="text-sm text-muted-foreground">
            RCs já emitidas pelo PCM que ainda não têm pedido de compra colocado.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px]">SLA (dias)</Label>
            <Input
              type="number"
              min={1}
              value={slaDias}
              onChange={(e) => setSlaDias(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-24"
            />
          </div>
          <Button variant="outline" size="sm" onClick={baixarCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icone={<FileText className="h-4 w-4" />}
          label="REQUISIÇÕES TOTAIS EM ABERTO"
          valor={kpis.linhas}
          legenda={`${kpis.pecas} peças aguardando pedido`}
          cor={viridisAt(1)}
          acao={
            <>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={gerarPdf}>
                <FileText className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={baixarCsvItens}>
                <Download className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
            </>
          }
        />
        <Kpi icone={<FileText className="h-4 w-4" />} label="RCs ÚNICAS EM ABERTO" valor={kpis.rcs} legenda={`Média de ${(kpis.rcs ? kpis.linhas / kpis.rcs : 0).toFixed(1)} itens por RC`} cor={VIRIDIS_SECONDARY} />
        <Kpi icone={<Wrench className="h-4 w-4" />} label="EQUIPAMENTOS IMPACTADOS" valor={kpis.eqs} legenda={`${kpis.oss} OS envolvidas`} cor={VIRIDIS_PRIMARY} />
        <Kpi icone={<Clock className="h-4 w-4" />} label="ESPERA MÉDIA" valor={`${kpis.medio.toFixed(1)}d`} legenda={`Pior caso: ${kpis.pior} dias`} cor={viridisAt(6)} />
        <Kpi icone={<AlertTriangle className="h-4 w-4" />} label={`ACIMA DO SLA (${slaDias}D)`} valor={kpis.rcsAtrasadas} legenda={`${kpis.atrasadas} itens · ${kpis.pctAtraso.toFixed(0)}% do total`} cor="#7a2048" alerta={kpis.rcsAtrasadas > 0} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icone={<FileText className="h-4 w-4" />} label="PEÇAS COM PEDIDO EM APROVAÇÃO" valor={aprov.linhas} legenda={`${aprov.pecas} peças aguardando aprovação`} cor={viridisAt(2)} />
        <Kpi icone={<FileText className="h-4 w-4" />} label="PEDIDOS ÚNICOS EM APROVAÇÃO" valor={aprov.pedidos} legenda={`Média de ${(aprov.pedidos ? aprov.linhas / aprov.pedidos : 0).toFixed(1)} itens por pedido`} cor={VIRIDIS_SECONDARY} />
        <Kpi icone={<Layers className="h-4 w-4" />} label="POR INSTÂNCIA" valor={`${aprov.coord}/${aprov.ger}/${aprov.dir}`} legenda="Pedidos com Coord. / Ger. / Dir." cor={VIRIDIS_PRIMARY} />
        <Kpi icone={<Clock className="h-4 w-4" />} label="ESPERA MÉDIA APROVAÇÃO" valor={`${aprov.medio.toFixed(1)}d`} legenda={`Pior caso: ${aprov.pior} dias`} cor={viridisAt(6)} />
        <Kpi icone={<AlertTriangle className="h-4 w-4" />} label="PEDIDOS +1 DIA EM APROVAÇÃO" valor={aprov.atrasados} legenda="Cobrar o aprovador" cor="#7a2048" alerta={aprov.atrasados > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" /> Aging das RCs sem pedido</CardTitle>
            <CardDescription>Quantidade de itens e RCs únicas por faixa de espera</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="itens" name="Itens" radius={[4, 4, 0, 0]}>
                  {aging.map((_, i) => <Cell key={i} fill={viridisAt(i * 2)} />)}
                  <LabelList dataKey="itens" position="top" fontSize={11} />
                </Bar>
                <Bar dataKey="rcs" name="RCs únicas" fill={VIRIDIS_ACCENT} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="rcs" position="top" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 equipamentos — maior espera</CardTitle>
            <CardDescription>Máquinas com RC parada há mais tempo (dias sem pedido)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topEquip} layout="vertical" margin={{ left: 24, right: 36 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [n === "Dias esperando" ? `${v} dias` : v, n]} />
                <Bar dataKey="pior" name="Dias esperando" radius={[0, 4, 4, 0]}>
                  {topEquip.map((_, i) => <Cell key={i} fill={viridisAt(i)} />)}
                  <LabelList
                    dataKey="pior"
                    position="right"
                    fontSize={11}
                    formatter={(v: number) => `${v}d`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução mensal</CardTitle>
            <CardDescription>RCs emitidas por mês que seguem sem pedido</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="itens" name="Itens" stroke={VIRIDIS_SECONDARY} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="itens" position="top" fontSize={10} />
                </Line>
                <Line type="monotone" dataKey="rcs" name="RCs únicas" stroke={VIRIDIS_PRIMARY} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="rcs" position="bottom" fontSize={10} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Composição por categoria de material</CardTitle>
            <CardDescription>O que está parado</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porCategoria}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                  label={({ name, value }: { name?: string; value?: number }) => `${name}: ${value}`}
                  labelLine={false}
                  fontSize={10}
                >
                  {porCategoria.map((_, i) => <Cell key={i} fill={VIRIDIS[i % VIRIDIS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <ConsultaRcs fonte={fonte} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">RCs mais críticas</CardTitle>
          <CardDescription>Ordenadas pelo maior tempo sem pedido de compra</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">RC</th>
                <th className="py-2 pr-3">Dias em aberto</th>
                <th className="py-2 pr-3">Itens</th>
                <th className="py-2 pr-3">Máquinas</th>
                <th className="py-2 pr-3">OS</th>
              </tr>
            </thead>
            <tbody>
              {porRc.slice(0, 25).map((r) => (
                <tr key={r.rc} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold">{r.rc}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={r.idade > slaDias ? "destructive" : "secondary"}>{r.idade} dias</Badge>
                  </td>
                  <td className="py-2 pr-3">{r.itens}</td>
                  <td className="py-2 pr-3 text-xs">{[...r.maquinas].join(" · ")}</td>
                  <td className="py-2 pr-3 text-xs">{[...r.os].join(" · ")}</td>
                </tr>
              ))}
              {porRc.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhuma RC sem tratativa. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CustoEquipamento fonte={fonte as any[]} />
      <RelatorioPendencias fonte={fonte} />
      <RelatorioAprovacao fonte={fonte} />
    </section>
  );
}

function RelatorioPendencias({ fonte }: { fonte: Item[] }) {
  const fd = (v?: string | null) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—");
  const grupos = useMemo(() => {
    const sem: Item[] = [], apr: Item[] = [], rej: Item[] = [];
    for (const s of fonte) {
      if (isRcSemPedido(s)) sem.push(s);
      else if (String(s.status).startsWith("PEDIDO_EM_APROVACAO")) apr.push(s);
      else if (s.status === "PEDIDO_REPROVADO_GESTAO") rej.push(s);
    }
    const ord = (l: Item[]) => l.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return [
      { titulo: "RC sem pedido", lista: ord(sem), ref: (s: any) => s.pcm_at ?? s.created_at },
      { titulo: "Pedidos em aprovação", lista: ord(apr), ref: (s: any) => s.aprovador_gestao_at ?? s.pcm_at ?? s.created_at },
      { titulo: "Pedidos rejeitados", lista: ord(rej), ref: (s: any) => s.aprovador_gestao_at ?? s.pcm_at ?? s.created_at },
    ];
  }, [fonte]);
  const total = grupos.reduce((n, g) => n + g.lista.length, 0);

  const pdf = () => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
    const cols = ["MÁQUINA", "OS", "RC", "PEDIDO", "CÓDIGO", "DESCRIÇÃO", "QTD", "SITUAÇÃO", "SOLICITADA", "APROV. SUPERV.", "RC (PCM)", "ENVIO P/ APROV.", "PRAZO", "DIAS PARADO", "MOTIVO / OBS"];
    const sec = grupos.map((g) => `<h2>${esc(g.titulo)} — ${g.lista.length} peça(s)</h2>${g.lista.length === 0 ? "<p>Nada pendente.</p>" : `
      <table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${g.lista.map((s) => { const a = s as any; const d = dias(g.ref(a)); return `<tr${d >= 2 ? ' class="atraso"' : ""}>${[
        s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "—", s.os_numero, s.rc_numero ?? "", s.numero_pedido_compra ?? "",
        s.codigo_peca ?? "", s.descricao, s.quantidade, STATUS_LABEL[s.status] ?? s.status,
        fd(s.created_at), fd(a.supervisor_at), fd(s.pcm_at), fd(a.aprovador_gestao_at), fd(a.prazo_entrega ?? a.pedido_compra?.prazo_entrega), d,
        [a.motivo_reprovacao_gestao, a.observacoes_pcm].filter(Boolean).join(" · "),
      ].map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`; }).join("")}
      </tbody></table>`}`).join("");
    const cores = ["#440154", "#3b528b", "#21918c", "#5ec962", "#8b1a3a"];
    const painel = grupos.map((g) => {
      const l = g.lista as any[];
      const unicos = new Set(l.map((s) => (g.titulo === "RC sem pedido" ? s.rc_numero : s.numero_pedido_compra) || "—")).size;
      const maqs = new Set(l.map((s) => s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "—")).size;
      const ds = l.map((s) => dias(g.ref(s)));
      const media = ds.length ? (ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1) : "0";
      const pior = ds.length ? Math.max(...ds) : 0;
      const atr = ds.filter((d) => d >= 2).length;
      const pecas = l.reduce((n, s) => n + Number(s.quantidade || 0), 0);
      const nome = g.titulo === "RC sem pedido" ? "RCs únicas" : "Pedidos únicos";
      const cards = [
        ["Linhas pendentes", l.length, `${pecas} peças`],
        [nome, unicos, unicos ? `Média de ${(l.length / unicos).toFixed(1)} itens` : "—"],
        ["Máquinas impactadas", maqs, `${new Set(l.map((s) => s.os_numero)).size} OS envolvidas`],
        ["Espera média", `${media}d`, `Pior caso: ${pior} dias`],
        ["Parados 2+ dias", atr, l.length ? `${Math.round((atr / l.length) * 100)}% do total` : "—"],
      ];
      return `<h3>${esc(g.titulo)}</h3><div class="kpis">${cards.map((c, i) => `<div class="kpi" style="border-top-color:${cores[i]}"><div class="kt">${esc(c[0])}</div><div class="kv"${i === 4 && Number(c[1]) > 0 ? ' style="color:#8b1a3a"' : ""}>${esc(c[1])}</div><div class="ks">${esc(c[2])}</div></div>`).join("")}</div>`;
    }).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pendências de compras</title>
      <style>body{font-family:Arial,sans-serif;margin:20px;color:#1f2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;color:#3b528b}p{font-size:11px;color:#5a6270}
      h3{font-size:11px;margin:10px 0 4px;text-transform:uppercase;color:#5a6270}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;page-break-inside:avoid}
      .kpi{background:#fffdf0;border:1px solid #ece6cf;border-top:4px solid;border-radius:8px;padding:8px 10px}.kt{font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:#5a6270}.kv{font-size:20px;font-weight:700;margin:3px 0}.ks{font-size:8.5px;color:#5a6270}
      table{width:100%;border-collapse:collapse;font-size:8.5px}th{background:#21918c;color:#fff;text-align:left;padding:4px}
      td{border-bottom:1px solid #e6e9ee;padding:3px 4px;vertical-align:top}tr.atraso td{background:#fdecef}tr{page-break-inside:avoid}@page{size:A4 landscape;margin:10mm}</style></head><body>
      <h1>Relatório de pendências por tipo</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")} · ${total} peça(s) pendente(s). Linhas em vermelho: paradas há 2 dias ou mais.</p>
      ${painel}
      ${sec}<script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Relatório de pendências por tipo</CardTitle>
          <CardDescription>
            RC sem pedido: {grupos[0].lista.length} · Em aprovação: {grupos[1].lista.length} · Rejeitados: {grupos[2].lista.length} — com todas as datas
          </CardDescription>
        </div>
        <Button size="sm" onClick={pdf}><FileText className="mr-1 h-4 w-4" /> Baixar PDF</Button>
      </CardHeader>
    </Card>
  );
}


const INSTANCIA: Record<string, string> = {
  PEDIDO_EM_APROVACAO_COORD: "COORDENADOR",
  PEDIDO_EM_APROVACAO_GERENTE: "GERENTE",
  PEDIDO_EM_APROVACAO_DIRETORIA: "DIRETORIA",
};

function RelatorioAprovacao({ fonte }: { fonte: Item[] }) {
  const linhas = useMemo(() => {
    const m = new Map<string, { pedido: string; instancia: string; aprovador: string; desde: string; itens: number; pecas: number; rcs: Set<string>; maquinas: Set<string>; os: Set<string> }>();
    for (const s of fonte) {
      if (!String(s.status).startsWith("PEDIDO_EM_APROVACAO") || !s.numero_pedido_compra?.trim()) continue;
      const k = s.numero_pedido_compra.trim().toUpperCase();
      const a = s as any;
      const desde = a.aprovador_gestao_at ?? s.pcm_at ?? s.created_at;
      const cur = m.get(k) ?? { pedido: k, instancia: INSTANCIA[s.status] ?? s.status, aprovador: a.coordenador ?? a.pedido_compra?.coordenador ?? "", desde, itens: 0, pecas: 0, rcs: new Set<string>(), maquinas: new Set<string>(), os: new Set<string>() };
      cur.itens += 1;
      cur.pecas += Number(s.quantidade) || 0;
      if (desde < cur.desde) cur.desde = desde;
      if (s.rc_numero) cur.rcs.add(s.rc_numero.trim());
      cur.maquinas.add(s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "—");
      cur.os.add(s.os_numero);
      m.set(k, cur);
    }
    return [...m.values()].map((x) => ({ ...x, dias: dias(x.desde) })).sort((a, b) => b.dias - a.dias);
  }, [fonte]);

  const cols = ["PEDIDO", "COM QUEM", "DESDE", "DIAS", "ITENS", "PEÇAS", "RCs", "MÁQUINAS", "OS"];
  const row = (r: (typeof linhas)[number]) => [
    r.pedido, r.instancia, new Date(r.desde).toLocaleDateString("pt-BR"), r.dias, r.itens, r.pecas,
    [...r.rcs].join(" / "), [...r.maquinas].join(" / "), [...r.os].join(" / "),
  ];

  const csv = () => {
    const txt = [cols.join(";"), ...linhas.map((r) => row(r).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + txt], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-em-aprovacao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pdf = () => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedidos em aprovação</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#1f2430}h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#5a6270}
      table{width:100%;border-collapse:collapse;font-size:10px}th{background:#21918c;color:#fff;text-align:left;padding:5px}
      td{border-bottom:1px solid #e6e9ee;padding:4px 5px}tr.atraso td{background:#fdecef}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>Pedidos em aprovação</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")} · ${linhas.length} pedidos</p>
      <table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${linhas.map((r) => `<tr${r.dias >= 1 ? ' class="atraso"' : ""}>${row(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
      </tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Relatório — pedidos em aprovação</CardTitle>
          <CardDescription>Um por pedido, com quem está e há quantos dias</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={pdf}><FileText className="mr-1 h-4 w-4" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={csv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {cols.map((c) => <th key={c} className="py-2 pr-3">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.pedido} className="border-b last:border-0">
                <td className="py-2 pr-3 font-semibold">{r.pedido}</td>
                <td className="py-2 pr-3">{r.instancia}</td>
                <td className="py-2 pr-3">{new Date(r.desde).toLocaleDateString("pt-BR")}</td>
                <td className="py-2 pr-3"><Badge variant={r.dias >= 1 ? "destructive" : "secondary"}>{r.dias} dias</Badge></td>
                <td className="py-2 pr-3">{r.itens}</td>
                <td className="py-2 pr-3">{r.pecas}</td>
                <td className="py-2 pr-3 text-xs">{[...r.rcs].join(" · ")}</td>
                <td className="py-2 pr-3 text-xs">{[...r.maquinas].join(" · ")}</td>
                <td className="py-2 pr-3 text-xs">{[...r.os].join(" · ")}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={cols.length} className="py-6 text-center text-muted-foreground">Nenhum pedido em aprovação.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  SOLICITADA: "AGUARDANDO SUPERVISOR",
  APROVADA_SUPERVISOR: "FILA DO PCM",
  EM_TRATAMENTO_PCM: "RC CRIADA",
  PENDENCIA_SOLICITANTE: "DEVOLVIDA AO SOLICITANTE",
  PEDIDO_EM_APROVACAO_COORD: "PEDIDO EM APROVAÇÃO — COORDENADOR",
  PEDIDO_EM_APROVACAO_GERENTE: "PEDIDO EM APROVAÇÃO — GERENTE",
  PEDIDO_EM_APROVACAO_DIRETORIA: "PEDIDO EM APROVAÇÃO — DIRETORIA",
  PEDIDO_APROVADO_GESTAO: "PEDIDO APROVADO — ENVIAR",
  PEDIDO_COLOCADO: "ENVIADO AO FORNECEDOR",
  EM_TRANSITO: "ENVIADO AO FORNECEDOR",
  RECEBIDA_ALMOX: "RECEBIDA NO ALMOXARIFADO",
  ENTREGUE_MECANICO: "ENTREGUE AO SOLICITANTE",
  FINALIZADA: "FINALIZADA",
  REPROVADA: "REPROVADA PELO SUPERVISOR",
  CANCELADA_SUPERVISOR: "CANCELADA PELO SUPERVISOR",
  CANCELADA: "CANCELADA",
  PEDIDO_REPROVADO_GESTAO: "PEDIDO REJEITADO",
};

function MultiSelect({
  titulo,
  opcoes,
  selecionados,
  onChange,
}: {
  titulo: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const termos = busca
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const filtradas =
    termos.length === 0 ? opcoes : opcoes.filter((o) => termos.some((t) => o.toLowerCase().includes(t)));
  const alterna = (o: string) =>
    onChange(selecionados.includes(o) ? selecionados.filter((x) => x !== o) : [...selecionados, o]);
  const marcarEncontrados = () => onChange([...new Set([...selecionados, ...filtradas])]);
  return (
    <div className="flex flex-col gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 min-w-[200px] justify-between">
            <span className="truncate">
              {selecionados.length === 0 ? `${titulo}: todos` : `${titulo}: ${selecionados.length} selecionado(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <Input
            placeholder="Digite e separe por vírgula: EG 170, EG 200"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                marcarEncontrados();
                setBusca("");
              }
            }}
            className="mb-2 h-8"
          />
          {termos.length > 0 && filtradas.length > 0 && (
            <Button variant="secondary" size="sm" className="mb-2 w-full text-xs" onClick={marcarEncontrados}>
              Marcar os {filtradas.length} encontrados
            </Button>
          )}
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {filtradas.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                <Checkbox checked={selecionados.includes(o)} onCheckedChange={() => alterna(o)} />
                <span className="truncate">{o}</span>
              </label>
            ))}
            {filtradas.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nada encontrado.</p>}
          </div>
          {selecionados.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => onChange([])}>
              Limpar seleção
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {selecionados.length > 0 && (
        <div className="flex max-w-[420px] flex-wrap gap-1">
          {selecionados.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => alterna(s)}
              className="flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] hover:bg-destructive/10"
              title="Remover"
            >
              {s} <span className="font-bold">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}


function ConsultaRcs({ fonte }: { fonte: Item[] }) {
  const [maquinas, setMaquinas] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);

  const linhas = useMemo(() => {
    const m = new Map<
      string,
      { chave: string; maquina: string; rc: string; criada: string; itens: number; pecas: number; status: Map<string, number>; semPedido: number; pecasSemPedido: number }
    >();
    for (const s of fonte) {
      // todas as RCs já feitas pelo PCM (qualquer status), para permitir filtrar por status
      if (!s.rc_numero || !String(s.rc_numero).trim() || s.em_cadastro) continue;
      const maquina = s.equipamento?.prefixo_interno || s.equipamento?.codigo_armac || "SEM MÁQUINA";
      const rc = s.rc_numero!.trim().toUpperCase();
      const chave = `${maquina}|${rc}`;
      const data = s.pcm_at ?? s.created_at;
      const cur =
        m.get(chave) ?? { chave, maquina, rc, criada: data, itens: 0, pecas: 0, status: new Map<string, number>(), semPedido: 0, pecasSemPedido: 0 };
      cur.itens += 1;
      cur.pecas += Number(s.quantidade) || 0;
      if (data < cur.criada) cur.criada = data;
      // "em aberto" = sem pedido de compra e ainda não finalizada/cancelada (mesma regra dos KPIs)
      const emAberto = isRcSemPedido(s);
      if (emAberto) {
        cur.semPedido += 1;
        cur.pecasSemPedido += Number(s.quantidade) || 0;
      }
      const rot = emAberto ? "RC SEM PEDIDO" : (STATUS_LABEL[s.status] ?? s.status);
      cur.status.set(rot, (cur.status.get(rot) ?? 0) + 1);
      m.set(chave, cur);
    }
    return [...m.values()]
      .map((x) => {
        const ordenados = [...x.status.entries()].sort((a, b) => b[1] - a[1]);
        return {
          chave: x.chave,
          maquina: x.maquina,
          rc: x.rc,
          criada: x.criada,
          itens: x.itens,
          pecas: x.pecas,
          semPedido: x.semPedido,
          pecasSemPedido: x.pecasSemPedido,
          // qualquer peça ainda sem pedido faz a RC contar como "RC SEM PEDIDO"
          statusPrincipal: x.semPedido > 0 ? "RC SEM PEDIDO" : (ordenados[0]?.[0] ?? "—"),
          statusTodos: ordenados.map(([k, v]) => `${k} (${v})`).join(" · "),
          dias: dias(x.criada),
        };
      })
      .sort((a, b) => b.criada.localeCompare(a.criada));
  }, [fonte]);

  const opcoesMaquina = useMemo(() => [...new Set(linhas.map((l) => l.maquina))].sort(), [linhas]);
  const opcoesStatus = useMemo(() => [...new Set(linhas.map((l) => l.statusPrincipal))].sort(), [linhas]);

  const filtradas = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (maquinas.length === 0 || maquinas.includes(l.maquina)) &&
          (status.length === 0 || status.includes(l.statusPrincipal)),
      ),
    [linhas, maquinas, status],
  );

  const exportar = () => {
    const csv = [
      ["MÁQUINA", "RC", "DATA DA RC", "DIAS", "QTD PEÇAS", "PEÇAS SEM PEDIDO", "STATUS", "DETALHE DOS STATUS"].join(";"),
      ...filtradas.map((l) =>
        [
          l.maquina,
          l.rc,
          new Date(l.criada).toLocaleDateString("pt-BR"),
          l.dias,
          l.pecas,
          l.pecasSemPedido,
          l.statusPrincipal,
          l.statusTodos,
        ].join(";"),
      ),

    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rcs-por-maquina-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPdf = () => {
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
    const corpo = filtradas
      .map(
        (l) => `<tr>
        <td>${esc(l.maquina)}</td><td>${esc(l.rc)}</td>
        <td>${new Date(l.criada).toLocaleDateString("pt-BR")}</td>
        <td style="text-align:center">${l.dias}d</td>
        <td style="text-align:center">${l.pecas}</td>
        <td style="text-align:center">${l.pecasSemPedido}</td>
        <td>${esc(l.statusPrincipal)}</td><td>${esc(l.statusTodos)}</td>
      </tr>`,
      )
      .join("");
    const filtros = [
      maquinas.length ? `Máquinas: ${maquinas.join(", ")}` : "Todas as máquinas",
      status.length ? `Status: ${status.join(", ")}` : "Todos os status",
    ].join(" · ");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>RCs por máquina e status</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#1f2430}
        h1{font-size:18px;margin:0 0 4px}
        p.sub{margin:0 0 14px;font-size:12px;color:#5a6270}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th{background:#21918c;color:#fff;text-align:left;padding:5px}
        td{border-bottom:1px solid #e6e9ee;padding:4px 5px}
        @page{size:A4 landscape;margin:12mm}
      </style></head><body>
      <h1>RCs por máquina e status</h1>
      <p class="sub">Gerado em ${new Date().toLocaleString("pt-BR")} · ${esc(filtros)} · ${new Set(filtradas.map((l) => l.rc)).size} RC(s) · ${filtradas.reduce((a, l) => a + l.pecas, 0)} peças</p>
      <table><thead><tr><th>Máquina</th><th>RC</th><th>Data da RC</th><th>Dias</th><th>Qtd peças</th><th>Peças sem pedido</th><th>Status</th><th>Detalhe dos status</th></tr></thead>
      <tbody>${corpo}</tbody></table>
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListFilter className="h-4 w-4" /> Consulta por máquina e status
        </CardTitle>
        <CardDescription>
          Digite as máquinas separadas por vírgula (ex.: EG 170, EG 200) ou marque na lista. "Qtd peças" é a soma das
          quantidades pedidas na RC.
        </CardDescription>

      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect titulo="Máquinas" opcoes={opcoesMaquina} selecionados={maquinas} onChange={setMaquinas} />
          <MultiSelect titulo="Status" opcoes={opcoesStatus} selecionados={status} onChange={setStatus} />
          <Badge variant="secondary">{new Set(filtradas.map((l) => l.rc)).size} RC(s)</Badge>
          <Badge variant="secondary">{filtradas.reduce((a, l) => a + l.pecas, 0)} peças</Badge>
          <Button variant="outline" size="sm" onClick={exportar}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">Máquina</th>
                <th className="py-2 pr-3">RC</th>
                <th className="py-2 pr-3">Criada em</th>
                <th className="py-2 pr-3">Qtd peças</th>
                <th className="py-2 pr-3">Peças sem pedido</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.chave} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold">{l.maquina}</td>
                  <td className="py-2 pr-3">{l.rc}</td>
                  <td className="py-2 pr-3 text-xs">
                    {new Date(l.criada).toLocaleDateString("pt-BR")} <span className="text-muted-foreground">({l.dias}d)</span>
                  </td>
                  <td className="py-2 pr-3">{l.pecas}</td>
                  <td className={`py-2 pr-3 ${l.pecasSemPedido > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{l.pecasSemPedido}</td>


                  <td className="py-2 pr-3 text-xs" title={l.statusTodos}>
                    <Badge variant={l.statusPrincipal === "RC SEM PEDIDO" ? "destructive" : "secondary"}>
                      {l.statusPrincipal}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma RC para os filtros escolhidos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, valor, legenda, cor, icone, alerta, acao }: { label: string; valor: string | number; legenda: string; cor: string; icone: React.ReactNode; alerta?: boolean; acao?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full" style={{ background: cor }} />
      <CardHeader className="pb-1">
        <CardDescription className="flex items-center gap-2 text-[11px] font-semibold tracking-wider">
          <span style={{ color: cor }}>{icone}</span>
          {label}
        </CardDescription>
        <CardTitle className="text-3xl" style={{ color: alerta ? cor : undefined }}>{valor}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">{legenda}</p>
        {acao && <div className="mt-2 flex flex-wrap gap-2">{acao}</div>}
      </CardContent>
    </Card>
  );
}
