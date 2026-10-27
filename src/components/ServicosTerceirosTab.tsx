import { VIRIDIS_PRIMARY, VIRIDIS_SECONDARY } from "@/lib/viridis";
import { Fragment, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ehServico, mapaLinhasPorPedido, normalizarFornecedor, tipoServico, valorItem,
} from "@/lib/analise-compras";
import type { ItemSugestao } from "@/components/SugestaoComprasTab";

const STATUS_FORA = new Set(["REPROVADA", "CANCELADA_SUPERVISOR", "PEDIDO_REPROVADO_GESTAO", "CANCELADA"]);

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ServicosTerceirosTab({ items }: { items: ItemSugestao[] }) {
  const hoje = new Date();
  const [de, setDe] = useState(new Date(hoje.getTime() - 240 * 86400000).toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));

  const linhasPorPedido = useMemo(() => mapaLinhasPorPedido(items), [items]);

  const base = useMemo(() => {
    const ini = new Date(`${de}T00:00:00`).getTime();
    const fim = new Date(`${ate}T23:59:59`).getTime();
    return items.filter((s) => {
      if (STATUS_FORA.has(s.status)) return false;
      if (!ehServico(s.descricao)) return false;
      const d = new Date(s.pcm_at ?? s.created_at ?? "").getTime();
      return Number.isFinite(d) && d >= ini && d <= fim;
    });
  }, [items, de, ate]);

  const diasPeriodo = Math.max(
    30,
    (new Date(`${ate}T23:59:59`).getTime() - new Date(`${de}T00:00:00`).getTime()) / 86400000,
  );

  const porServico = useMemo(() => {
    const m = new Map<string, {
      nome: string; valor: number; ocorrencias: number;
      maquinas: Set<string>; modelos: Set<string>;
      fornecedores: Map<string, { valor: number; ocorrencias: number }>;
    }>();
    for (const s of base) {
      const k = tipoServico(s.descricao);
      const cur = m.get(k) ?? {
        nome: k, valor: 0, ocorrencias: 0,
        maquinas: new Set<string>(), modelos: new Set<string>(),
        fornecedores: new Map<string, { valor: number; ocorrencias: number }>(),
      };
      const v = valorItem(s, linhasPorPedido);
      cur.valor += v;
      cur.ocorrencias += 1;
      if (s.equipamento?.prefixo_interno) cur.maquinas.add(s.equipamento.prefixo_interno);
      if (s.equipamento?.modelo) cur.modelos.add(s.equipamento.modelo);
      const forn = normalizarFornecedor(s.fornecedor ?? s.pedido?.fornecedor);
      const f = cur.fornecedores.get(forn) ?? { valor: 0, ocorrencias: 0 };
      f.valor += v; f.ocorrencias += 1;
      cur.fornecedores.set(forn, f);
      m.set(k, cur);
    }
    return Array.from(m.values())
      .map((v) => {
        const anualizado = (v.valor / diasPeriodo) * 365;
        const internalizar = anualizado >= 60000 && v.ocorrencias >= 6;
        return {
          ...v,
          fornecedoresLista: Array.from(v.fornecedores, ([nome, f]) => ({
            nome, ...f,
            medio: f.ocorrencias ? f.valor / f.ocorrencias : 0,
            parte: v.valor ? (f.valor / v.valor) * 100 : 0,
          })).sort((a, b) => b.valor - a.valor),
          medio: v.ocorrencias ? v.valor / v.ocorrencias : 0,
          anualizado,
          internalizar,
        };
      })
      .sort((a, b) => b.valor - a.valor);
  }, [base, linhasPorPedido, diasPeriodo]);

  /** Gasto total por fornecedor de serviço (todos os tipos). */
  const porFornecedor = useMemo(() => {
    const m = new Map<string, { nome: string; valor: number; ocorrencias: number }>();
    for (const s of base) {
      const k = normalizarFornecedor(s.fornecedor ?? s.pedido?.fornecedor);
      const cur = m.get(k) ?? { nome: k, valor: 0, ocorrencias: 0 };
      cur.valor += valorItem(s, linhasPorPedido);
      cur.ocorrencias += 1;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [base, linhasPorPedido]);

  const rotuloMes = (k: string) => {
    const [a, mm] = k.split("-");
    const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${nomes[Number(mm) - 1] ?? mm}/${a.slice(2)}`;
  };

  const evolucao = useMemo(() => {
    const m = new Map<string, { valor: number; ocorrencias: number }>();
    for (const s of base) {
      const d = new Date(s.pcm_at ?? s.created_at ?? "");
      if (!Number.isFinite(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = m.get(k) ?? { valor: 0, ocorrencias: 0 };
      cur.valor += valorItem(s, linhasPorPedido);
      cur.ocorrencias += 1;
      m.set(k, cur);
    }
    // todos os meses do período, mesmo os sem gasto, para a linha ficar contínua
    const out: { mes: string; valor: number; ocorrencias: number }[] = [];
    const ini = new Date(`${de}T00:00:00`);
    const fim = new Date(`${ate}T00:00:00`);
    const cursor = new Date(ini.getFullYear(), ini.getMonth(), 1);
    while (cursor <= fim) {
      const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const v = m.get(k);
      out.push({ mes: rotuloMes(k), valor: Number((v?.valor ?? 0).toFixed(2)), ocorrencias: v?.ocorrencias ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [base, linhasPorPedido, de, ate]);

  const total = porServico.reduce((a, s) => a + s.valor, 0);
  const totalAnual = porServico.reduce((a, s) => a + s.anualizado, 0);
  const candidatos = porServico.filter((s) => s.internalizar);

  const baixarCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Serviço", "Fornecedor", "Ocorrências", "Máquinas", "Modelos", "Gasto no período",
      "Valor médio por ocorrência", "Participação no serviço (%)", "Gasto anualizado", "Avaliar internalizar"];
    const linhas: unknown[][] = [];
    for (const s of porServico) {
      linhas.push([
        s.nome, "TOTAL", s.ocorrencias, s.maquinas.size, s.modelos.size,
        s.valor.toFixed(2).replace(".", ","), s.medio.toFixed(2).replace(".", ","), "100",
        s.anualizado.toFixed(2).replace(".", ","), s.internalizar ? "SIM" : "",
      ]);
      for (const f of s.fornecedoresLista) {
        linhas.push([
          s.nome, f.nome, f.ocorrencias, "", "",
          f.valor.toFixed(2).replace(".", ","), f.medio.toFixed(2).replace(".", ","),
          f.parte.toFixed(1).replace(".", ","), "", "",
        ]);
      }
    }
    const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `servicos-terceiros-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" /></div>
        <Button size="sm" variant="outline" onClick={baixarCsv}>⬇ Baixar análise (CSV)</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Serviço não é sobressalente: aqui a leitura é de <b>gasto com terceiros</b>, para avaliar se
        compensa contratar gente própria. Canceladas e reprovadas ficam de fora.
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Serviços contratados</CardDescription><CardTitle className="text-lg">{base.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Gasto no período</CardDescription><CardTitle className="text-lg">{brl(total)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Gasto anualizado</CardDescription><CardTitle className="text-lg">{brl(totalAnual)}</CardTitle></CardHeader></Card>
        <Card className="border-primary"><CardHeader className="pb-2"><CardDescription>Avaliar internalizar</CardDescription><CardTitle className="text-lg text-primary">{candidatos.length}</CardTitle></CardHeader></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Gasto por tipo de serviço</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porServico.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="nome" width={170} fontSize={10} />
                <Tooltip formatter={(v: number) => brl(Number(v))} />
                <Bar dataKey="valor" name="Gasto" fill={VIRIDIS_PRIMARY} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução mensal do gasto com terceiros</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao} margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis yAxisId="v" fontSize={11} tickFormatter={(v: number) => `${Math.round(Number(v) / 1000)}k`} />
                <YAxis yAxisId="o" orientation="right" fontSize={11} allowDecimals={false} />
                <Tooltip formatter={(v: number, n: string) => (n === "R$" ? brl(Number(v)) : v)} />
                <Legend />
                <Line yAxisId="v" type="monotone" dataKey="valor" name="R$" stroke={VIRIDIS_PRIMARY}
                  strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
                <Line yAxisId="o" type="monotone" dataKey="ocorrencias" name="Ocorrências"
                  stroke={VIRIDIS_SECONDARY} strokeWidth={1.5} strokeDasharray="4 3"
                  dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gasto por fornecedor de serviço</CardTitle>
            <CardDescription>Quem executou os serviços no período.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-left">Fornecedor</th>
                  <th className="p-2 text-right">Ocorrências</th>
                  <th className="p-2 text-right">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {porFornecedor.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum serviço no período.</td></tr>
                )}
                {porFornecedor.map((f) => (
                  <tr key={f.nome} className="border-t">
                    <td className="p-2">{f.nome}</td>
                    <td className="p-2 text-right">{f.ocorrencias}</td>
                    <td className="p-2 text-right font-medium">{brl(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Serviços — leitura de decisão</CardTitle>
          <CardDescription>
            Gasto anualizado alto com muita recorrência indica que vale avaliar equipe própria em vez de terceiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-left">Serviço</th>
                <th className="p-2 text-right">Ocorrências</th>
                <th className="p-2 text-right">Máquinas</th>
                <th className="p-2 text-right">Modelos</th>
                <th className="p-2 text-right">Gasto no período</th>
                <th className="p-2 text-right">Média por ocorrência</th>
                <th className="p-2 text-right">Gasto anualizado</th>
                <th className="p-2 text-left">Leitura</th>
              </tr>
            </thead>
            <tbody>
              {porServico.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum serviço no período.</td></tr>
              )}
              {porServico.map((s) => (
                <Fragment key={s.nome}>
                  <tr className="border-t">
                    <td className="p-2 font-medium">{s.nome}</td>
                    <td className="p-2 text-right">{s.ocorrencias}</td>
                    <td className="p-2 text-right">{s.maquinas.size}</td>
                    <td className="p-2 text-right">{s.modelos.size}</td>
                    <td className="p-2 text-right">{brl(s.valor)}</td>
                    <td className="p-2 text-right">{brl(s.medio)}</td>
                    <td className="p-2 text-right font-semibold">{brl(s.anualizado)}</td>
                    <td className="p-2">
                      {s.internalizar
                        ? <Badge variant="destructive">Avaliar internalizar</Badge>
                        : <Badge variant="secondary">Manter terceiro</Badge>}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={8} className="p-0">
                      <details className="bg-muted/20">
                        <summary className="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground">
                          Fornecedores deste serviço ({s.fornecedoresLista.length})
                        </summary>
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="p-1 text-left">Fornecedor</th>
                              <th className="p-1 text-right">Ocorrências</th>
                              <th className="p-1 text-right">Gasto</th>
                              <th className="p-1 text-right">Média</th>
                              <th className="p-1 text-right">Participação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.fornecedoresLista.map((f) => (
                              <tr key={f.nome} className="border-t">
                                <td className="p-1">{f.nome}</td>
                                <td className="p-1 text-right">{f.ocorrencias}</td>
                                <td className="p-1 text-right">{brl(f.valor)}</td>
                                <td className="p-1 text-right">{brl(f.medio)}</td>
                                <td className="p-1 text-right">{f.parte.toFixed(0)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
