import { VIRIDIS, VIRIDIS_PRIMARY } from "@/lib/viridis";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ehServico, FORNECEDOR_SUSPEITO, mapaLinhasPorPedido, normalizarFornecedor,
  SEM_FORNECEDOR, semAcento, tipoPecaDe, valorItem,
} from "@/lib/analise-compras";


/** Estrutura mínima usada aqui (evita acoplar ao tipo gerado do painel). */
export type ItemSugestao = {
  id: string;
  status: string;
  quantidade: number;
  descricao: string;
  codigo_peca?: string | null;
  codigo_peca_normalizado?: string | null;
  rc_numero?: string | null;
  numero_pedido_compra?: string | null;
  fornecedor?: string | null;
  created_at?: string | null;
  pcm_at?: string | null;
  comprador_at?: string | null;
  data_recebimento_almox?: string | null;
  equipamento?: { prefixo_interno?: string; modelo?: string | null } | null;
  valor_item?: number | null;
  pedido?: { valor_total?: number | null; fornecedor?: string | null } | null;

};

const CHAVE_EXCECOES = "pcm:sugestao:excecoes";

const STATUS_FORA = new Set(["REPROVADA", "CANCELADA_SUPERVISOR", "PEDIDO_REPROVADO_GESTAO", "CANCELADA"]);

/* semAcento vem de @/lib/analise-compras */


const codigoChave = (s: string) => semAcento(s).replace(/[^A-Z0-9]/g, "");

/** Sinônimos comuns da oficina — cada grupo vira um token canônico. */
const SINONIMOS: string[][] = [
  ["SECADOR", "DESIDRATADOR", "FILTRO SECADOR"],
  ["RETENTOR", "VEDADOR", "VEDACAO"],
  ["CORREIA", "CORREIA V", "CORREIA EM V"],
  ["ELEMENTO FILTRANTE", "FILTRO DE AR", "ELEMENTO DE AR"],
  ["MANGUEIRA", "FLEXIVEL"],
  ["ROLAMENTO", "MANCAL"],
  ["PARAFUSO", "PINO ROSCA"],
  ["OLEO", "LUBRIFICANTE"],
  ["JUNTA", "GAXETA"],
];

const PALAVRAS_IGNORADAS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "E", "P", "PARA", "COM", "UN", "PC", "PCS", "UND",
  "ORIGINAL", "SIMILAR", "GENUINO", "NOVO", "PECA", "MAQUINA", "CX350C",
]);

function tokens(descricao: string): Set<string> {
  let txt = ` ${semAcento(descricao).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
  SINONIMOS.forEach((grupo, i) => {
    for (const termo of grupo) {
      const re = new RegExp(`\\s${termo.replace(/ /g, "\\s")}\\s`, "g");
      txt = txt.replace(re, ` @G${i} `);
    }
  });
  return new Set(
    txt.split(/\s+/).filter((t) => t && t.length > 1 && !PALAVRAS_IGNORADAS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter += 1; });
  return inter / (a.size + b.size - inter);
}

/* ---------------- Famílias de desgaste ---------------- */

type Familia =
  | "AR-CONDICIONADO" | "ELÉTRICA/ELETRÔNICA" | "FILTROS" | "CORREIAS"
  | "RETENTORES/VEDAÇÃO" | "MANGUEIRAS" | "LUBRIFICANTES" | "OUTROS";

const FAMILIAS: { nome: Familia; termos: string[] }[] = [
  {
    nome: "AR-CONDICIONADO",
    termos: ["AR CONDICIONADO", "AR-CONDICIONADO", "COMPRESSOR", "CONDENSADOR", "EVAPORADOR",
      "SECADOR", "DESIDRATADOR", "GAS R134", "R134", "VALVULA DE EXPANSAO", "CLIMATIZ"],
  },
  {
    nome: "ELÉTRICA/ELETRÔNICA",
    termos: ["CHICOTE", "RELE", "FUSIVEL", "LAMPADA", "H1", "H3", "H4", "H7", "LANTERNA",
      "LUZ DE PLACA", "FAROL", "SENSOR", "MODULO", "BATERIA", "ALTERNADOR", "MOTOR DE PARTIDA",
      "SOLENOIDE", "INTERRUPTOR", "CHAVE SETA", "TOMADA", "CABO ELETRICO", "PISCA"],
  },
  { nome: "FILTROS", termos: ["FILTRO", "ELEMENTO FILTRANTE", "ELEMENTO DE AR"] },
  { nome: "CORREIAS", termos: ["CORREIA"] },
  { nome: "RETENTORES/VEDAÇÃO", termos: ["RETENTOR", "VEDADOR", "VEDACAO", "JUNTA", "GAXETA", "ANEL O"] },
  { nome: "MANGUEIRAS", termos: ["MANGUEIRA", "FLEXIVEL", "TUBO HIDRAULICO"] },
  { nome: "LUBRIFICANTES", termos: ["OLEO", "LUBRIFICANTE", "GRAXA", "FLUIDO"] },
];

const BONUS_FAMILIA: Record<Familia, number> = {
  "AR-CONDICIONADO": 25,
  "ELÉTRICA/ELETRÔNICA": 22,
  FILTROS: 25,
  CORREIAS: 18,
  "RETENTORES/VEDAÇÃO": 14,
  MANGUEIRAS: 12,
  LUBRIFICANTES: 12,
  OUTROS: 0,
};

function familiaDe(descricao: string): Familia {
  const t = ` ${semAcento(descricao).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  for (const f of FAMILIAS) {
    if (f.termos.some((termo) => t.includes(` ${termo} `) || t.includes(`${termo}`))) return f.nome;
  }
  return "OUTROS";
}

/* Fornecedores: normalização em @/lib/analise-compras */


/* ---------------- Poisson ---------------- */

/** Menor k tal que P(X<=k) >= nível de confiança. */
function quantilPoisson(mu: number, nivel: number): number {
  if (mu <= 0) return 0;
  let p = Math.exp(-mu);
  let acum = p;
  let k = 0;
  while (acum < nivel && k < 500) {
    k += 1;
    p = (p * mu) / k;
    acum += p;
  }
  return k;
}

const probAte = (lambda30: number, dias: number) => 1 - Math.exp(-lambda30 * (dias / 30));

const mediana = (arr: number[]) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Ocasiao = { data: number; qtd: number; maquina: string };

type Cluster = {
  key: string;
  modelo: string;
  codigoPrincipal: string;
  aliases: { codigo: string; descricao: string; qtd: number }[];
  descricao: string;
  qtdTotal: number;
  maquinas: Set<string>;
  valor: number;
  prazos: number[];
  ocasioes: Map<string, Ocasiao>;
};

const dias = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return Number.isFinite(d) && d >= 0 ? d : null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function SugestaoComprasTab({ items }: { items: ItemSugestao[] }) {
  const hoje = new Date();
  const padraoDe = new Date(hoje.getTime() - 240 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(padraoDe);
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));
  const [modelo, setModelo] = useState("ALL");
  const [familia, setFamilia] = useState("ALL");
  const [nivel, setNivel] = useState(0.95);
  const [soRecorrentes, setSoRecorrentes] = useState(true);
  const [verPontuais, setVerPontuais] = useState(false);
  const [topPor, setTopPor] = useState<"qtd" | "valor">("qtd");
  const [excecoes, setExcecoes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(CHAVE_EXCECOES) ?? "[]") as string[]; } catch { return []; }
  });

  const salvarExcecao = (k: string) => {
    setExcecoes((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try { localStorage.setItem(CHAVE_EXCECOES, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const dentroPeriodo = (s: ItemSugestao) => {
    const ini = new Date(`${de}T00:00:00`).getTime();
    const fim = new Date(`${ate}T23:59:59`).getTime();
    const d = new Date(s.pcm_at ?? s.created_at ?? "").getTime();
    return Number.isFinite(d) && d >= ini && d <= fim;
  };

  const ignorados = useMemo(
    () => items.filter((s) => STATUS_FORA.has(s.status) && dentroPeriodo(s)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, de, ate],
  );

  const linhasPorPedido = useMemo(() => mapaLinhasPorPedido(items), [items]);

  const base = useMemo(() => items.filter((s) => {
    if (STATUS_FORA.has(s.status)) return false;
    if (!s.rc_numero && !s.numero_pedido_compra) return false;
    if (ehServico(s.descricao)) return false; // serviço não é sobressalente
    if (!dentroPeriodo(s)) return false;
    if (modelo !== "ALL" && (s.equipamento?.modelo ?? "SEM MODELO") !== modelo) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, de, ate, modelo]);


  const modelos = useMemo(
    () => Array.from(new Set(items.map((s) => s.equipamento?.modelo ?? "SEM MODELO"))).sort(),
    [items],
  );

  const diasPeriodo = Math.max(
    30,
    (new Date(`${ate}T23:59:59`).getTime() - new Date(`${de}T00:00:00`).getTime()) / 86400000,
  );

  const clusters = useMemo(() => {
    const mapa = new Map<string, Cluster>();
    for (const s of base) {
      const mod = s.equipamento?.modelo ?? "SEM MODELO";
      const cod = codigoChave(s.codigo_peca_normalizado || s.codigo_peca || "");
      const key = `${mod}|${cod || `D:${semAcento(s.descricao).slice(0, 40)}`}`;
      let c = mapa.get(key);
      if (!c) {
        c = {
          key, modelo: mod, codigoPrincipal: s.codigo_peca ?? "—", aliases: [],
          descricao: s.descricao, qtdTotal: 0, maquinas: new Set(), valor: 0, prazos: [],
          ocasioes: new Map(),
        };
        mapa.set(key, c);
      }
      const qtd = Number(s.quantidade) || 0;
      c.qtdTotal += qtd;
      const maq = s.equipamento?.prefixo_interno ?? "—";
      if (s.equipamento?.prefixo_interno) c.maquinas.add(s.equipamento.prefixo_interno);
      c.valor += valorItem(s, linhasPorPedido);
      const p = dias(s.comprador_at, s.data_recebimento_almox);
      if (p !== null) c.prazos.push(p);

      const data = new Date(s.pcm_at ?? s.created_at ?? "").getTime();
      const chaveOcasiao = s.numero_pedido_compra || s.rc_numero
        || `${maq}:${new Date(data).toISOString().slice(0, 10)}`;
      const oc = c.ocasioes.get(chaveOcasiao);
      if (oc) oc.qtd += qtd;
      else c.ocasioes.set(chaveOcasiao, { data, qtd, maquina: maq });

      const alias = c.aliases.find((a) => a.codigo === (s.codigo_peca ?? "—"));
      if (alias) alias.qtd += qtd;
      else c.aliases.push({ codigo: s.codigo_peca ?? "—", descricao: s.descricao, qtd });
    }

    // 2ª passada: funde clusters do mesmo modelo com descrição semelhante
    const lista = Array.from(mapa.values());
    const usados = new Set<string>();
    const finais: Cluster[] = [];
    for (const c of lista) {
      if (usados.has(c.key)) continue;
      usados.add(c.key);
      const tc = tokens(c.descricao);
      for (const o of lista) {
        if (usados.has(o.key) || o.modelo !== c.modelo) continue;
        if (excecoes.includes(o.key) || excecoes.includes(c.key)) continue;
        if (jaccard(tc, tokens(o.descricao)) < 0.6) continue;
        usados.add(o.key);
        c.qtdTotal += o.qtdTotal;
        o.maquinas.forEach((m) => c.maquinas.add(m));
        c.valor += o.valor;
        c.prazos.push(...o.prazos);
        c.aliases.push(...o.aliases);
        o.ocasioes.forEach((v, k) => {
          const ex = c.ocasioes.get(k);
          if (ex) ex.qtd += v.qtd;
          else c.ocasioes.set(k, v);
        });
      }
      c.aliases.sort((a, b) => b.qtd - a.qtd);
      c.codigoPrincipal = c.aliases[0]?.codigo ?? "—";
      finais.push(c);
    }
    return finais;
  }, [base, excecoes, linhasPorPedido]);

  const prazoGlobal = useMemo(() => {
    const todos = clusters.flatMap((c) => c.prazos);
    return todos.length ? todos.reduce((a, b) => a + b, 0) / todos.length : 15;
  }, [clusters]);

  const analise = useMemo(() => clusters.map((c) => {
    const ocasioes = Array.from(c.ocasioes.values()).sort((a, b) => a.data - b.data);
    // janela móvel de 30 dias
    let maxOcasioes30 = 0;
    let maxMaquinas30 = 0;
    for (let i = 0; i < ocasioes.length; i += 1) {
      const janela = ocasioes.filter((o) => o.data >= ocasioes[i].data && o.data < ocasioes[i].data + 30 * 86400000);
      maxOcasioes30 = Math.max(maxOcasioes30, janela.length);
      maxMaquinas30 = Math.max(maxMaquinas30, new Set(janela.map((o) => o.maquina)).size);
    }
    const fam = familiaDe(c.descricao);
    const desgaste = fam !== "OUTROS";
    // Recorrência: qualquer peça pedida 2+ vezes entra; pico em 30 dias / várias máquinas dão o motivo mais forte.
    let motivo = "";
    if (maxOcasioes30 > 3) motivo = `${maxOcasioes30} pedidos em 30 dias`;
    else if (maxMaquinas30 >= 2) motivo = `${maxMaquinas30} máquinas na mesma janela de 30 dias`;
    else if (ocasioes.length >= 3) motivo = `${ocasioes.length} pedidos no período`;
    else if (ocasioes.length >= 2 && c.maquinas.size >= 2) motivo = `${ocasioes.length} pedidos em ${c.maquinas.size} máquinas no período`;
    else if (desgaste && ocasioes.length >= 2) motivo = `peça de desgaste (${fam.toLowerCase()}) com ${ocasioes.length} pedidos no período`;
    else if (ocasioes.length >= 2) motivo = `${ocasioes.length} pedidos no período`;
    const recorrente = motivo !== "";

    const lambda30 = ocasioes.length / (diasPeriodo / 30);
    const qtdTipica = Math.max(1, Math.round(mediana(ocasioes.map((o) => o.qtd))));
    const prazo = c.prazos.length ? c.prazos.reduce((a, b) => a + b, 0) / c.prazos.length : prazoGlobal;
    const horizonte = prazo + 30;
    const mu = lambda30 * (horizonte / 30);
    const eventos = quantilPoisson(mu, nivel);
    const sugerido = Math.max(recorrente ? 1 : 0, qtdTipica * eventos);
    const p30 = probAte(lambda30, 30);
    const p90 = probAte(lambda30, 90);
    const p180 = probAte(lambda30, 180);
    const probHorizonte = probAte(lambda30, horizonte);
    const score = probHorizonte * 100 + c.maquinas.size * 10 + Math.min(prazo, 60) / 6 + BONUS_FAMILIA[fam];
    const prioridade = score >= 90 ? "CRITICA" : score >= 55 ? "ATENCAO" : "MONITORAR";
    return {
      ...c, ocasioesTotal: ocasioes.length, maxOcasioes30, maxMaquinas30, recorrente, motivo,
      lambda30, qtdTipica, prazo, horizonte, eventos, sugerido, familia: fam,
      p30, p90, p180, score, prioridade,
    };
  }), [clusters, prazoGlobal, diasPeriodo, nivel]);

  const filtradas = useMemo(
    () => analise.filter((s) => familia === "ALL" || s.familia === familia),
    [analise, familia],
  );

  const sugestoes = useMemo(
    () => filtradas.filter((s) => (soRecorrentes ? s.recorrente : true)).sort((a, b) => b.score - a.score),
    [filtradas, soRecorrentes],
  );

  const pontuais = useMemo(
    () => filtradas.filter((s) => !s.recorrente).sort((a, b) => b.qtdTotal - a.qtdTotal),
    [filtradas],
  );

  /** Mais comprados no período — todas as peças, recorrentes ou não. */
  const topPecas = useMemo(() => (
    [...filtradas]
      .sort((a, b) => (topPor === "valor" ? b.valor - a.valor : b.qtdTotal - a.qtdTotal))
      .slice(0, 15)
      .map((s) => ({
        nome: `${s.descricao.slice(0, 22)}${s.descricao.length > 22 ? "…" : ""}`,
        qtd: s.qtdTotal, valor: s.valor, ocorrencias: s.ocasioesTotal,
      }))
  ), [filtradas, topPor]);

  const porModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtradas) m.set(c.modelo, (m.get(c.modelo) ?? 0) + c.qtdTotal);
    return Array.from(m, ([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 12);
  }, [filtradas]);

  const evolucao = useMemo(() => {
    const m = new Map<string, { mes: string; itens: number; valor: number }>();
    for (const s of base) {
      const d = new Date(s.pcm_at ?? s.created_at ?? "");
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = m.get(k) ?? { mes: k, itens: 0, valor: 0 };
      cur.itens += 1;
      cur.valor += valorItem(s, linhasPorPedido);
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [base, linhasPorPedido]);


  const fornecedores = useMemo(() => {
    const m = new Map<string, { valor: number; itens: number }>();
    for (const s of base) {
      const f = normalizarFornecedor(s.fornecedor ?? s.pedido?.fornecedor);
      const cur = m.get(f) ?? { valor: 0, itens: 0 };
      cur.valor += valorItem(s, linhasPorPedido);
      cur.itens += 1;
      m.set(f, cur);
    }
    return Array.from(m, ([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor);
  }, [base, linhasPorPedido]);

  const comprasPorFornecedor = useMemo(() => {
    const m = new Map<string, {
      nome: string; valor: number; itens: number;
      linhas: { id: string; descricao: string; codigo: string; maquina: string; qtd: number; valor: number }[];
    }>();
    for (const s of base) {
      const f = normalizarFornecedor(s.fornecedor ?? s.pedido?.fornecedor);
      const cur = m.get(f) ?? { nome: f, valor: 0, itens: 0, linhas: [] };
      const v = valorItem(s, linhasPorPedido);
      cur.valor += v;
      cur.itens += 1;
      cur.linhas.push({
        id: s.id, descricao: s.descricao, codigo: s.codigo_peca ?? "—",
        maquina: s.equipamento?.prefixo_interno ?? "—", qtd: Number(s.quantidade) || 0, valor: v,
      });
      m.set(f, cur);
    }
    return Array.from(m.values())
      .map((f) => ({ ...f, linhas: f.linhas.sort((a, b) => b.valor - a.valor) }))
      .sort((a, b) => b.valor - a.valor);
  }, [base, linhasPorPedido]);

  const porFornecedor = useMemo(
    () => fornecedores
      .filter((f) => f.nome !== SEM_FORNECEDOR && f.nome !== FORNECEDOR_SUSPEITO && f.valor > 0)
      .slice(0, 8),
    [fornecedores],
  );
  const semFornecedor = fornecedores.find((f) => f.nome === SEM_FORNECEDOR);
  const suspeito = fornecedores.find((f) => f.nome === FORNECEDOR_SUSPEITO);

  const porFamilia = useMemo(() => {
    const m = new Map<string, { valor: number; qtd: number }>();
    for (const c of analise) {
      const cur = m.get(c.familia) ?? { valor: 0, qtd: 0 };
      cur.valor += c.valor;
      cur.qtd += c.qtdTotal;
      m.set(c.familia, cur);
    }
    return Array.from(m, ([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor);
  }, [analise]);

  /** Árvore família → tipo de peça → modelo de máquina → peças compradas. */
  const arvoreFamilias = useMemo(() => {
    type Linha = {
      id: string; data: string; maquina: string; descricao: string; codigo: string;
      qtd: number; valor: number; rc: string; pedido: string; fornecedor: string;
    };
    type NoModelo = { valor: number; qtd: number; itens: Linha[] };
    type No = { valor: number; qtd: number; modelos: Map<string, NoModelo> };
    const m = new Map<string, { valor: number; qtd: number; tipos: Map<string, No> }>();
    for (const s of base) {
      const fam = familiaDe(s.descricao);
      const tipo = tipoPecaDe(s.descricao);
      const mod = s.equipamento?.modelo ?? "SEM MODELO";
      const v = valorItem(s, linhasPorPedido);
      const q = Number(s.quantidade) || 0;
      const f = m.get(fam) ?? { valor: 0, qtd: 0, tipos: new Map<string, No>() };
      f.valor += v; f.qtd += q;
      const t = f.tipos.get(tipo) ?? { valor: 0, qtd: 0, modelos: new Map<string, NoModelo>() };
      t.valor += v; t.qtd += q;
      const mm = t.modelos.get(mod) ?? { valor: 0, qtd: 0, itens: [] };
      mm.valor += v; mm.qtd += q;
      const d = new Date(s.pcm_at ?? s.created_at ?? "");
      mm.itens.push({
        id: s.id,
        data: Number.isFinite(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—",
        maquina: s.equipamento?.prefixo_interno ?? "—",
        descricao: s.descricao,
        codigo: s.codigo_peca ?? "—",
        qtd: q,
        valor: v,
        rc: s.rc_numero ?? "—",
        pedido: s.numero_pedido_compra ?? "—",
        fornecedor: normalizarFornecedor(s.fornecedor ?? s.pedido?.fornecedor),
      });
      t.modelos.set(mod, mm);
      f.tipos.set(tipo, t);
      m.set(fam, f);
    }
    return Array.from(m, ([nome, f]) => ({
      nome, valor: f.valor, qtd: f.qtd,
      tipos: Array.from(f.tipos, ([tn, t]) => ({
        nome: tn, valor: t.valor, qtd: t.qtd,
        modelos: Array.from(t.modelos, ([mn, mv]) => ({
          nome: mn, valor: mv.valor, qtd: mv.qtd,
          itens: mv.itens.sort((a, b) => b.valor - a.valor),
        })).sort((a, b) => b.valor - a.valor),
      })).sort((a, b) => b.valor - a.valor),
    })).sort((a, b) => b.valor - a.valor);
  }, [base, linhasPorPedido]);

  const cores = [...VIRIDIS];

  const valorTotal = base.reduce((a, s) => a + valorItem(s, linhasPorPedido), 0);

  const criticos = sugestoes.filter((s) => s.prioridade === "CRITICA").length;

  const gerarCsv = (nome: string, header: string[], linhas: unknown[][]) => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const baixarCsvFamilias = () => {
    const linhas: unknown[][] = [];
    for (const f of arvoreFamilias) {
      for (const t of f.tipos) {
        for (const m of t.modelos) {
          for (const i of m.itens) {
            linhas.push([
              f.nome, t.nome, m.nome, i.data, i.maquina, i.descricao, i.codigo,
              i.qtd, i.valor.toFixed(2).replace(".", ","), i.rc, i.pedido, i.fornecedor,
            ]);
          }
        }
      }
    }
    gerarCsv("gasto-por-familia", [
      "Família", "Tipo de peça", "Modelo", "Data", "Máquina", "Descrição", "Código",
      "Quantidade", "Valor", "RC", "Pedido", "Fornecedor",
    ], linhas);
  };

  const baixarCsv = () => {

    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Peça", "Código principal", "Códigos similares", "Modelo", "Família",
      "Consumo no período", "Ocasiões", "Máquinas distintas", "Máx. ocasiões em 30d",
      "λ (ocasiões/30d)", "Qtd típica por ocasião", "Prazo médio (dias)", "Horizonte (dias)",
      `Eventos (${Math.round(nivel * 100)}%)`, "Sugestão de estoque",
      "Prob. 30d", "Prob. 90d", "Prob. 180d", "Score", "Prioridade"];
    const linhas = sugestoes.map((s) => [
      s.descricao, s.codigoPrincipal, s.aliases.map((a) => a.codigo).join(" / "), s.modelo, s.familia,
      s.qtdTotal, s.ocasioesTotal, s.maquinas.size, s.maxOcasioes30,
      s.lambda30.toFixed(2).replace(".", ","), s.qtdTipica, s.prazo.toFixed(0), s.horizonte.toFixed(0),
      s.eventos, s.sugerido, pct(s.p30), pct(s.p90), pct(s.p180), s.score.toFixed(0), s.prioridade,
    ]);
    const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sugestao-sobressalentes-${new Date().toISOString().slice(0, 10)}.csv`;
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
        <div>
          <Label className="text-xs">Modelo</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={modelo} onChange={(e) => setModelo(e.target.value)}>
            <option value="ALL">Todos os modelos</option>
            {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Família</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={familia} onChange={(e) => setFamilia(e.target.value)}>
            <option value="ALL">Todas as famílias</option>
            {porFamilia.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Confiabilidade</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={String(nivel)} onChange={(e) => setNivel(Number(e.target.value))}>
            <option value="0.9">90%</option>
            <option value="0.95">95%</option>
            <option value="0.99">99%</option>
          </select>
        </div>
        <Button size="sm" variant={soRecorrentes ? "default" : "outline"} onClick={() => setSoRecorrentes((v) => !v)}>
          {soRecorrentes ? "Só recorrentes" : "Mostrando tudo"}
        </Button>
        <Button size="sm" variant="outline" onClick={baixarCsv}>⬇ Baixar sugestão (CSV)</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Canceladas e reprovadas não entram nas quantidades — {ignorados} item(ns) ignorado(s) no período.
        Entra na sugestão toda peça pedida 2 ou mais vezes no período; picos (3+ pedidos em 30 dias) e peças usadas em várias
        máquinas ficam no topo. Compra única no período fica em "Compras pontuais".
        Cobertura de estoque por Poisson a {Math.round(nivel * 100)}%.
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Peças no período</CardDescription><CardTitle className="text-lg">{base.reduce((a, s) => a + (Number(s.quantidade) || 0), 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Valor comprado</CardDescription><CardTitle className="text-lg">{brl(valorTotal)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Itens recorrentes</CardDescription><CardTitle className="text-lg">{analise.filter((s) => s.recorrente).length}</CardTitle></CardHeader></Card>
        <Card className="border-destructive"><CardHeader className="pb-2"><CardDescription>Itens críticos</CardDescription><CardTitle className="text-lg text-destructive">{criticos}</CardTitle></CardHeader></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Top 15 peças mais compradas</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setTopPor((v) => (v === "qtd" ? "valor" : "qtd"))}>
                {topPor === "qtd" ? "Por quantidade" : "Por valor gasto"}
              </Button>
            </div>
            <CardDescription className="text-xs">
              Todas as peças do período (recorrentes ou não); canceladas e reprovadas fora.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPecas} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="nome" width={150} fontSize={10} />
                <Tooltip formatter={(v: number) => (topPor === "valor" ? brl(Number(v)) : v)} />
                <Legend />
                {topPor === "qtd"
                  ? <Bar dataKey="qtd" name="Quantidade" fill={VIRIDIS_PRIMARY} radius={[0, 4, 4, 0]} />
                  : <Bar dataKey="valor" name="Valor gasto" fill={VIRIDIS_PRIMARY} radius={[0, 4, 4, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consumo por modelo de máquina</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porModelo} margin={{ left: 8, right: 16, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" fontSize={10} angle={-35} textAnchor="end" interval={0} height={60} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="qtd" name="Peças" fill={VIRIDIS_PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução mensal</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="itens" name="Itens" stroke={VIRIDIS_PRIMARY} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Participação por fornecedor (R$)</CardTitle>
            {semFornecedor && (
              <CardDescription>
                Sem fornecedor específico (importado matriz/almoxarifado): {semFornecedor.itens} item(ns), {brl(semFornecedor.valor)} — fora do gráfico.
              </CardDescription>
            )}
            {suspeito && (
              <CardDescription className="text-destructive">
                Compra não reconhecida (PF Comercial Brasil): {suspeito.itens} item(ns), {brl(suspeito.valor)} — separada da participação.
              </CardDescription>
            )}

          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={porFornecedor} dataKey="valor" nameKey="nome" outerRadius={90} label={(e: { nome?: string }) => (e.nome ?? "").slice(0, 12)}>
                  {porFornecedor.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gasto por família de material</CardTitle>
            <CardDescription>
              Família → tipo de peça → modelo de máquina → peças compradas (data, máquina, código,
              valor, RC, pedido e fornecedor). Canceladas e reprovadas ficam de fora
              ({ignorados} item(ns) no período).
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[28rem] overflow-y-auto space-y-1 p-2">
            {arvoreFamilias.map((f) => (
              <details key={f.nome} className="rounded-md border">
                <summary className="flex cursor-pointer items-center justify-between gap-2 p-2 text-sm font-medium">
                  <span>{f.nome}</span>
                  <span className="text-xs text-muted-foreground">{f.qtd} pç · {brl(f.valor)}</span>
                </summary>
                <div className="space-y-1 border-t p-2">
                  {f.tipos.map((t) => (
                    <details key={t.nome} className="rounded border bg-muted/20">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 p-2 text-xs">
                        <span>{t.nome}</span>
                        <span className="text-muted-foreground">{t.qtd} pç · {brl(t.valor)}</span>
                      </summary>
                      <div className="space-y-1 p-1">
                        {t.modelos.map((m) => (
                          <details key={m.nome} className="rounded border bg-background">
                            <summary className="flex cursor-pointer items-center justify-between gap-2 p-1.5 text-xs">
                              <span className="font-medium">{m.nome}</span>
                              <span className="text-muted-foreground">{m.qtd} pç · {brl(m.valor)}</span>
                            </summary>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[640px] text-[11px]">
                                <thead className="bg-muted/40">
                                  <tr>
                                    <th className="p-1 text-left">Data</th>
                                    <th className="p-1 text-left">Máquina</th>
                                    <th className="p-1 text-left">Peça</th>
                                    <th className="p-1 text-left">Código</th>
                                    <th className="p-1 text-right">Qtd</th>
                                    <th className="p-1 text-right">Valor</th>
                                    <th className="p-1 text-left">RC</th>
                                    <th className="p-1 text-left">Pedido</th>
                                    <th className="p-1 text-left">Fornecedor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.itens.map((i) => (
                                    <tr key={i.id} className="border-t">
                                      <td className="p-1 whitespace-nowrap">{i.data}</td>
                                      <td className="p-1 whitespace-nowrap">{i.maquina}</td>
                                      <td className="p-1">{i.descricao}</td>
                                      <td className="p-1 whitespace-nowrap">{i.codigo}</td>
                                      <td className="p-1 text-right">{i.qtd}</td>
                                      <td className="p-1 text-right">{brl(i.valor)}</td>
                                      <td className="p-1 whitespace-nowrap">{i.rc}</td>
                                      <td className="p-1 whitespace-nowrap">{i.pedido}</td>
                                      <td className="p-1">{i.fornecedor}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            <Button size="sm" variant="outline" className="mt-2" onClick={baixarCsvFamilias}>⬇ Baixar árvore (CSV)</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Compras por fornecedor</CardTitle>
            <CardDescription>Abra o fornecedor para ver o que foi comprado nele.</CardDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              {([false, true] as const).map((comPecas) => (
                <Button key={String(comPecas)} size="sm" variant="outline" onClick={() => {
                  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
                  const total = comprasPorFornecedor.reduce((a, f) => a + f.valor, 0);
                  const blocos = comprasPorFornecedor.map((f) => `
                    <tr class="forn"><td>${esc(f.nome)}</td><td class="r">${f.itens}</td><td class="r">${esc(brl(f.valor))}</td><td class="r">${total ? ((f.valor / total) * 100).toFixed(1) : "0"}%</td></tr>
                    ${comPecas ? `<tr><td colspan="4"><table class="sub"><thead><tr><th>Peça</th><th>Código</th><th>Máquina</th><th class="r">Qtd</th><th class="r">Valor</th></tr></thead><tbody>${f.linhas.map((l) => `<tr><td>${esc(l.descricao)}</td><td>${esc(l.codigo)}</td><td>${esc(l.maquina)}</td><td class="r">${esc(l.qtd)}</td><td class="r">${esc(brl(l.valor))}</td></tr>`).join("")}</tbody></table></td></tr>` : ""}`).join("");
                  const w = window.open("", "_blank");
                  if (!w) return;
                  w.document.write(`<html><head><title>Compras por fornecedor</title><style>
                    body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#222}h1{font-size:16px;margin:0 0 4px}
                    table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
                    .r{text-align:right}thead th{background:#f0f0f0}.forn td{font-weight:bold;background:#eef4f0;border-top:2px solid #999}
                    .sub{margin:2px 0 8px 16px;width:calc(100% - 16px)}.sub th{background:#fafafa;font-size:10px}
                  </style></head><body><h1>Compras por fornecedor</h1>
                  <div>Gerado em ${new Date().toLocaleString("pt-BR")} · Total ${esc(brl(total))}</div><br/>
                  <table><thead><tr><th>Fornecedor</th><th class="r">Itens</th><th class="r">Valor</th><th class="r">%</th></tr></thead><tbody>${blocos}</tbody></table>
                  <script>window.onload=()=>window.print()</script></body></html>`);
                  w.document.close();
                }}>🖨 PDF {comPecas ? "com peças" : "resumido"}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="max-h-[28rem] overflow-y-auto space-y-1 p-2">
            {comprasPorFornecedor.map((f) => (
              <details key={f.nome} className="rounded-md border">
                <summary className="flex cursor-pointer items-center justify-between gap-2 p-2 text-sm">
                  <span className="font-medium">
                    {f.nome}
                    {f.nome === FORNECEDOR_SUSPEITO && <Badge variant="destructive" className="ml-2">não reconhecida</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{f.itens} item(ns) · {brl(f.valor)}</span>
                </summary>
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr><th className="p-1 text-left">Peça</th><th className="p-1 text-left">Código</th><th className="p-1 text-left">Máquina</th><th className="p-1 text-right">Qtd</th><th className="p-1 text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {f.linhas.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-1">{l.descricao}</td>
                        <td className="p-1">{l.codigo}</td>
                        <td className="p-1">{l.maquina}</td>
                        <td className="p-1 text-right">{l.qtd}</td>
                        <td className="p-1 text-right">{brl(l.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sugestão de sobressalentes — cobertura Poisson {Math.round(nivel * 100)}%</CardTitle>
          <CardDescription>
            Quantidade típica por ocasião × nº de ocorrências previsto no prazo de entrega + 30 dias de segurança. Críticos no topo.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-left">Peça</th>
                <th className="p-2 text-left">Código</th>
                <th className="p-2 text-left">Modelo</th>
                <th className="p-2 text-left">Família</th>
                <th className="p-2 text-right">Consumo</th>
                <th className="p-2 text-right">Ocasiões</th>
                <th className="p-2 text-right">Máquinas</th>
                <th className="p-2 text-right">λ/30d</th>
                <th className="p-2 text-right">Prob. 30/90/180d</th>
                <th className="p-2 text-right">Prazo</th>
                <th className="p-2 text-right">Sugestão</th>
                <th className="p-2 text-left">Prioridade</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {sugestoes.length === 0 && (
                <tr><td colSpan={13} className="p-4 text-center text-muted-foreground">Nenhuma peça recorrente no período selecionado.</td></tr>
              )}
              {sugestoes.map((s) => (
                <tr key={s.key} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{s.descricao}</div>
                    {s.motivo && <div className="text-[11px] text-muted-foreground">Entrou por: {s.motivo}</div>}
                    {s.aliases.length > 1 && (
                      <div className="text-[11px] text-muted-foreground">
                        +{s.aliases.length - 1} similar(es): {s.aliases.slice(1).map((a) => `${a.codigo} (${a.descricao})`).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">{s.codigoPrincipal}</td>
                  <td className="p-2 whitespace-nowrap">{s.modelo}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{s.familia}</td>
                  <td className="p-2 text-right">{s.qtdTotal}</td>
                  <td className="p-2 text-right">{s.ocasioesTotal}</td>
                  <td className="p-2 text-right">{s.maquinas.size}</td>
                  <td className="p-2 text-right">{s.lambda30.toFixed(2)}</td>
                  <td className="p-2 text-right whitespace-nowrap text-xs">{pct(s.p30)} / {pct(s.p90)} / {pct(s.p180)}</td>
                  <td className="p-2 text-right">{s.prazo.toFixed(0)}d</td>
                  <td className="p-2 text-right font-semibold">{s.sugerido}</td>
                  <td className="p-2">
                    <Badge variant={s.prioridade === "CRITICA" ? "destructive" : s.prioridade === "ATENCAO" ? "default" : "secondary"}>
                      {s.prioridade === "CRITICA" ? "🔴 Crítica" : s.prioridade === "ATENCAO" ? "🟠 Atenção" : "⚪ Monitorar"}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">
                    {s.aliases.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => salvarExcecao(s.key)}>
                        {excecoes.includes(s.key) ? "Reagrupar" : "Separar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">Compras pontuais (sem recorrência)</CardTitle>
            <CardDescription>{pontuais.length} item(ns) comprados uma única vez — não geram sugestão de estoque.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setVerPontuais((v) => !v)}>
            {verPontuais ? "Ocultar" : "Ver lista"}
          </Button>
        </CardHeader>
        {verPontuais && (
          <CardContent className="max-h-96 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs"><tr><th className="p-2 text-left">Peça</th><th className="p-2 text-left">Código</th><th className="p-2 text-left">Modelo</th><th className="p-2 text-right">Consumo</th><th className="p-2 text-right">Ocasiões</th></tr></thead>
              <tbody>
                {pontuais.map((s) => (
                  <tr key={s.key} className="border-t">
                    <td className="p-2">{s.descricao}</td>
                    <td className="p-2">{s.codigoPrincipal}</td>
                    <td className="p-2">{s.modelo}</td>
                    <td className="p-2 text-right">{s.qtdTotal}</td>
                    <td className="p-2 text-right">{s.ocasioesTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>
    </section>
  );
}
