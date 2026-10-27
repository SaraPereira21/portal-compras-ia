import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aplicarAjustesSap, aplicarPedidosSap, aplicarVinculoRcSap, type AjusteSap } from "@/lib/sap.functions";
import { identificarAutorizador, statusDoSap } from "@/lib/sap-status";

export type ItemSap = {
  id: string;
  descricao: string;
  quantidade: number;
  codigo_peca?: string | null;
  rc_numero?: string | null;
  numero_pedido_compra?: string | null;
  fornecedor?: string | null;
  valor_item?: number | null;
  pedido?: { valor_total?: number | null; fornecedor?: string | null } | null;
};

type LinhaSap = {
  rc: string;
  material: string;
  texto: string;
  qtd: number;
  pedido: string;
  dataPedido: string;
  valor: number;
  fornecedor: string;
};

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Aceita os nomes de coluna do relatório do SAP (e variações comuns). */
function coluna(linha: Record<string, unknown>, ...nomes: string[]) {
  const chaves = Object.keys(linha);
  for (const n of nomes) {
    const k = chaves.find((c) => norm(c) === norm(n));
    if (k !== undefined) return linha[k];
  }
  for (const n of nomes) {
    const k = chaves.find((c) => norm(c).includes(norm(n)));
    if (k !== undefined) return linha[k];
  }
  return undefined;
}

function numero2(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

type PedidoLinha = {
  numero: string;
  valor: number;
  fornecedorBruto: string;
  fornecedor: string | null;
  statusSap: string;
  statusAut: string;
  autorizador: string;
  status: string | null;
  coordenador: string | null;
  gerente: string | null;
  diretor: string | null;
  data: string | null;
};

const ROTULO_STATUS: Record<string, string> = {
  PEDIDO_REPROVADO_GESTAO: "Reprovado pela gestão",
  PEDIDO_EM_APROVACAO_COORD: "Em aprovação (coordenação)",
  PEDIDO_EM_APROVACAO_GERENTE: "Em aprovação (gerência)",
  PEDIDO_EM_APROVACAO_DIRETORIA: "Em aprovação (diretoria)",
  PEDIDO_APROVADO_GESTAO: "Aprovado, aguardando envio",
  PEDIDO_COLOCADO: "Pedido colocado / em trânsito",
};

/** Deixa o nome do fornecedor limpo e junta as empresas que são a mesma. */
function limparFornecedor(bruto: unknown): string | null {
  let f = norm(bruto).replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim();
  if (!f) return null;
  if (f.includes("PF COMERCIAL BRASIL")) return "COMPRA NAO RECONHECIDA (ESTELIONATO)";
  if (f.includes("IMPORTADO") || f.startsWith("MATRIZ")) return null;
  if (f === "FME" || (f.includes("EMPRESA DEMO") && f.includes("MAQUINAS"))) return "EMPRESA DEMO";
  if (f.startsWith("VOX")) return "VOX COMERCIAL ATACADISTA DE PECAS";
  if (f.startsWith("BREV")) return "BREVIDIESEL";
  return f;
}

function dataIso(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const br = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}

export default function ImportarSapTab({ items, onChange }: { items: ItemSap[]; onChange?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaSap[]>([]);
  const [pedidos, setPedidos] = useState<PedidoLinha[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ignorados, setIgnorados] = useState<string[]>([]);
  const aplicar = useServerFn(aplicarAjustesSap);
  const aplicarPedidos = useServerFn(aplicarPedidosSap);
  const aplicarVinculo = useServerFn(aplicarVinculoRcSap);

  const lerArquivo = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const cabecalhos = raw.length ? Object.keys(raw[0]!).map((c) => norm(c)) : [];
    const ehPedidos = cabecalhos.some((c) => c.includes("NOME DE FORNECEDOR") || c.includes("STATUS DA AUTORIZACAO"));

    if (ehPedidos) {
      const parsed: PedidoLinha[] = [];
      const vistos = new Set<string>();
      for (const l of raw) {
        const numero = soDigitos(coluna(l, "Pedido", "Nº pedido"));
        if (!numero || vistos.has(numero)) continue;
        vistos.add(numero);
        const autorizadorBruto = String(coluna(l, "Autorizador") ?? "");
        const aut = identificarAutorizador(autorizadorBruto);
        const statusSap = String(coluna(l, "Status") ?? "").trim();
        const statusAut = String(coluna(l, "Status da autorização", "Status da autorizacao") ?? "").trim();
        const fornecedorBruto = String(coluna(l, "Nome de fornecedor", "Fornecedor") ?? "").trim();
        parsed.push({
          numero,
          valor: numero2(coluna(l, "Valor líquido pedido", "Valor liquido pedido", "Valor líquido", "Valor total")),
          fornecedorBruto,
          fornecedor: limparFornecedor(fornecedorBruto),
          statusSap, statusAut, autorizador: norm(autorizadorBruto),
          status: statusDoSap(statusSap, statusAut, aut.nivel),
          coordenador: aut.coordenador, gerente: aut.gerente, diretor: aut.diretor,
          data: dataIso(coluna(l, "Data do pedido", "Data")),
        });
      }
      setPedidos(parsed);
      setLinhas([]);
      setNomeArquivo(file.name);
      toast.success(`Relatório de pedidos: ${parsed.length} pedido(s) lido(s).`);
      return;
    }

    const parsed: LinhaSap[] = raw.map((l) => ({
      rc: String(coluna(l, "Requisição de compra", "Requisicao de compra", "RC") ?? "").trim(),
      material: String(coluna(l, "Material", "Código", "Codigo") ?? "").trim(),
      texto: String(coluna(l, "Texto breve", "Descrição", "Descricao") ?? "").trim(),
      qtd: numero2(coluna(l, "Qtd.solicitada", "Quantidade", "Qtd")),
      pedido: soDigitos(coluna(l, "Pedido", "Nº pedido", "Numero do pedido")),
      dataPedido: String(coluna(l, "Data do pedido") ?? "").slice(0, 10),
      valor: numero2(coluna(l, "Valor total", "Valor")),
      fornecedor: String(coluna(l, "Fornecedor", "Nome do fornecedor", "Razão social") ?? "").trim(),
    })).filter((l) => l.rc || l.pedido);
    setLinhas(parsed);
    setPedidos([]);
    setNomeArquivo(file.name);
    toast.success(`Relatório de RC: ${parsed.length} linha(s) lida(s).`);
  };

  const aplicarRelatorioPedidos = async () => {
    if (!pedidos.length) return;
    setSalvando(true);
    try {
      let pcs = 0, pecas = 0, nao = 0;
      for (let i = 0; i < pedidos.length; i += 150) {
        const r = await aplicarPedidos({
          data: {
            pedidos: pedidos.slice(i, i + 150).map((p) => ({
              numero: p.numero, valor: p.valor, fornecedor: p.fornecedor, status: p.status,
              coordenador: p.coordenador, gerente: p.gerente, diretor: p.diretor, data: p.data,
            })),
          },
        });
        pcs += r.pedidosAtualizados; pecas += r.pecasAtualizadas; nao += r.naoEncontrados.length;
      }
      toast.success(`${pcs} pedido(s) e ${pecas} peça(s) atualizados. ${nao} pedido(s) sem correspondência.`);
      setPedidos([]);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    } finally {
      setSalvando(false);
    }
  };

  const corrigirVinculos = async () => {
    if (!linhas.length) return;
    setSalvando(true);
    try {
      let vinculadas = 0;
      for (let i = 0; i < linhas.length; i += 4000) {
        const r = await aplicarVinculo({
          data: {
            linhas: linhas.slice(i, i + 4000).map((l) => ({
              rc: l.rc, material: l.material, texto: l.texto, pedido: l.pedido,
            })),
          },
        });
        vinculadas += r.vinculadas;
      }
      toast.success(`${vinculadas} peça(s) tiveram o pedido corrigido.`);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    } finally {
      setSalvando(false);
    }
  };


  /** Cruzamento: RC + material/descrição; fallback por pedido. */
  const diffs = useMemo(() => {
    if (!linhas.length) return [];
    const porRc = new Map<string, LinhaSap[]>();
    const porPedido = new Map<string, LinhaSap[]>();
    for (const l of linhas) {
      if (l.rc) porRc.set(l.rc, [...(porRc.get(l.rc) ?? []), l]);
      if (l.pedido) porPedido.set(l.pedido, [...(porPedido.get(l.pedido) ?? []), l]);
    }
    const naoEncontrados: string[] = [];
    const res: {
      item: ItemSap; sap: LinhaSap; valorAtual: number | null; diferenca: number;
    }[] = [];
    for (const it of items) {
      const rc = (it.rc_numero ?? "").trim();
      const ped = soDigitos(it.numero_pedido_compra);
      const candidatos = (rc && porRc.get(rc)) || (ped && porPedido.get(ped)) || [];
      if (!candidatos.length) {
        if (rc || ped) naoEncontrados.push(rc || ped);
        continue;
      }
      const cod = norm(it.codigo_peca).replace(/[^A-Z0-9]/g, "");
      const desc = norm(it.descricao);
      const achado =
        candidatos.find((c) => cod && norm(c.material).replace(/[^A-Z0-9]/g, "") === cod)
        ?? candidatos.find((c) => norm(c.texto) === desc)
        ?? candidatos.find((c) => desc && norm(c.texto).startsWith(desc.slice(0, 12)))
        ?? (candidatos.length === 1 ? candidatos[0] : undefined);
      if (!achado) continue;
      const atual = it.valor_item ?? null;
      const dif = achado.valor - (atual ?? 0);
      if (atual !== null && Math.abs(dif) < 0.01 && (!achado.fornecedor || achado.fornecedor === it.fornecedor)) continue;
      res.push({ item: it, sap: achado, valorAtual: atual, diferenca: dif });
    }
    setIgnorados(Array.from(new Set(naoEncontrados)));
    return res.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
  }, [linhas, items]);

  const totalSap = diffs.reduce((a, d) => a + d.sap.valor, 0);
  const totalAtual = diffs.reduce((a, d) => a + (d.valorAtual ?? 0), 0);

  const aplicarTudo = async () => {
    if (!diffs.length) return;
    setSalvando(true);
    try {
      const ajustes: AjusteSap[] = diffs.map((d) => ({
        id: d.item.id,
        valor_item: d.sap.valor,
        numero_pedido_compra: d.sap.pedido || null,
        fornecedor: d.sap.fornecedor || null,
      }));
      for (let i = 0; i < ajustes.length; i += 300) {
        await aplicar({ data: { ajustes: ajustes.slice(i, i + 300) } });
      }
      toast.success(`${ajustes.length} item(ns) corrigido(s) com o relatório do SAP.`);
      setLinhas([]);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    } finally {
      setSalvando(false);
    }
  };

  const aplicarUm = async (d: (typeof diffs)[number]) => {
    try {
      await aplicar({
        data: {
          ajustes: [{
            id: d.item.id, valor_item: d.sap.valor,
            numero_pedido_compra: d.sap.pedido || null,
            fornecedor: d.sap.fornecedor || null,
          }],
        },
      });
      toast.success("Item corrigido.");
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    }
  };

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📥 Importar relatório do SAP</CardTitle>
          <CardDescription>
            Suba o <strong>relatório de pedidos</strong> (fornecedor, status, autorizador e valor do pedido)
            ou o <strong>relatório de RCs</strong> (RC, material, quantidade e pedido). O portal reconhece
            sozinho qual é o arquivo, mostra a prévia do que vai mudar e só aplica quando você confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerArquivo(f); e.target.value = ""; }}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()}>Escolher arquivo</Button>
          {nomeArquivo && (
            <Badge variant="secondary">
              {nomeArquivo} — {pedidos.length ? `${pedidos.length} pedido(s)` : `${linhas.length} linha(s)`}
            </Badge>
          )}
          {pedidos.length > 0 && (
            <Button size="sm" disabled={salvando} onClick={() => void aplicarRelatorioPedidos()}>
              {salvando ? "Aplicando…" : `Aplicar ${pedidos.length} pedido(s)`}
            </Button>
          )}
          {linhas.length > 0 && (
            <Button size="sm" variant="outline" disabled={salvando} onClick={() => void corrigirVinculos()}>
              Corrigir vínculo peça → pedido
            </Button>
          )}
          {diffs.length > 0 && (
            <Button size="sm" variant="default" disabled={salvando} onClick={aplicarTudo}>
              {salvando ? "Aplicando…" : `Aplicar ${diffs.length} correção(ões)`}

            </Button>
          )}
        </CardContent>
      </Card>

      {pedidos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Pedidos no arquivo</CardDescription><CardTitle className="text-lg">{pedidos.length}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Valor total</CardDescription><CardTitle className="text-lg">{brl(pedidos.reduce((a, p) => a + p.valor, 0))}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Fornecedores</CardDescription><CardTitle className="text-lg">{new Set(pedidos.map((p) => p.fornecedor ?? "—")).size}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Em aprovação</CardDescription><CardTitle className="text-lg">{pedidos.filter((p) => p.status?.startsWith("PEDIDO_EM_APROVACAO")).length}</CardTitle></CardHeader></Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Prévia dos pedidos</CardTitle></CardHeader>
            <CardContent className="max-h-[32rem] overflow-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="p-2 text-left">Pedido</th>
                    <th className="p-2 text-left">Fornecedor</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Autorizador</th>
                    <th className="p-2 text-left">Vai ficar como</th>
                    <th className="p-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.slice(0, 400).map((p) => (
                    <tr key={p.numero} className="border-t">
                      <td className="p-2 whitespace-nowrap">{p.numero}</td>
                      <td className="p-2">{p.fornecedor ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">{p.data ? p.data.split("-").reverse().join("/") : "—"}</td>
                      <td className="p-2">{p.autorizador || "—"}</td>
                      <td className="p-2">{p.status ? (ROTULO_STATUS[p.status] ?? p.status) : "Sem alteração"}</td>
                      <td className="p-2 text-right font-medium">{brl(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardDescription>Divergências</CardDescription><CardTitle className="text-lg">{diffs.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Valor no portal</CardDescription><CardTitle className="text-lg">{brl(totalAtual)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Valor no SAP</CardDescription><CardTitle className="text-lg">{brl(totalSap)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Sem correspondência</CardDescription><CardTitle className="text-lg">{ignorados.length}</CardTitle></CardHeader></Card>
        </div>
      )}

      {diffs.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Prévia das correções</CardTitle></CardHeader>
          <CardContent className="max-h-[32rem] overflow-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-left">Peça (portal)</th>
                  <th className="p-2 text-left">RC</th>
                  <th className="p-2 text-left">Texto no SAP</th>
                  <th className="p-2 text-left">Pedido</th>
                  <th className="p-2 text-right">Valor atual</th>
                  <th className="p-2 text-right">Valor SAP</th>
                  <th className="p-2 text-right">Diferença</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {diffs.slice(0, 400).map((d) => (
                  <tr key={d.item.id} className="border-t">
                    <td className="p-2">{d.item.descricao}</td>
                    <td className="p-2 whitespace-nowrap">{d.item.rc_numero ?? "—"}</td>
                    <td className="p-2">{d.sap.texto}</td>
                    <td className="p-2 whitespace-nowrap">{d.sap.pedido || "—"}</td>
                    <td className="p-2 text-right">{d.valorAtual === null ? "—" : brl(d.valorAtual)}</td>
                    <td className="p-2 text-right font-medium">{brl(d.sap.valor)}</td>
                    <td className={`p-2 text-right ${d.diferenca >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {brl(d.diferenca)}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void aplicarUm(d)}>Aplicar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
