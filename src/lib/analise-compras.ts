/** Helpers compartilhados pelas análises de compras (sugestão de sobressalentes e serviços). */

export const semAcento = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/* ------------- serviço x material ------------- */

const TERMOS_SERVICO = [
  "SERV ", "SERVICO", "SERVICOS", "MAO DE OBRA", "RECONDICIONAMENTO", "RECUPERACAO",
  "USINAGEM", "RETIFICA", "BORRACHARIA", "VIDRACARIA", "PINTURA", "CONFECCAO",
  "DIAGNOSTICO", "LOCACAO", "MANUTENCAO CORRETIVA", "MANUTENCAO PREVENTIVA",
  "INSTALACAO", "REPARO", "CONSERTO", "LAVAGEM", "SOLDA ", "TRANSPORTE", "GUINCHO",
  "CALIBRAGEM", "ALINHAMENTO", "BALANCEAMENTO", "TESTE ",
];

export function ehServico(descricao: string): boolean {
  const t = ` ${semAcento(descricao).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
  return TERMOS_SERVICO.some((termo) => t.includes(` ${termo.trim()}`));
}

/** Nome curto do serviço, para agrupar variações de escrita. */
export function tipoServico(descricao: string): string {
  const t = semAcento(descricao).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const mapa: [RegExp, string][] = [
    [/AR CONDICIONADO|CLIMATIZ|REFRIGERAC/, "AR-CONDICIONADO"],
    [/PINTURA|PRIMER|FUNILARIA/, "PINTURA / FUNILARIA"],
    [/MANGUEIRA|HIDRAULIC/, "MANGUEIRAS / HIDRÁULICA"],
    [/BOMBA INJETORA|INJETOR|BICO/, "BOMBA INJETORA / INJEÇÃO"],
    [/TURBINA/, "TURBINA"],
    [/RETIFICA|MOTOR/, "RETÍFICA DE MOTOR"],
    [/VIDRAC|VIDRO/, "VIDRAÇARIA"],
    [/BORRACHARIA|PNEU/, "BORRACHARIA"],
    [/USINAGEM|TORNO|SOLDA/, "USINAGEM / SOLDA"],
    [/BANCO/, "REPARO DE BANCO"],
    [/ELETRIC|ELETRON|CHICOTE|ALTERNADOR|PARTIDA/, "ELÉTRICA"],
    [/LOCACAO/, "LOCAÇÃO"],
    [/DIAGNOSTICO/, "DIAGNÓSTICO"],
    [/CORRETIVA/, "MANUTENÇÃO CORRETIVA"],
    [/PREVENTIVA/, "MANUTENÇÃO PREVENTIVA"],
    [/TRANSPORTE|GUINCHO/, "TRANSPORTE / GUINCHO"],
  ];
  for (const [re, nome] of mapa) if (re.test(t)) return nome;
  return t.split(" ").slice(0, 3).join(" ") || "OUTROS SERVIÇOS";
}

/* ------------- fornecedores ------------- */

export const SEM_FORNECEDOR = "SEM FORNECEDOR ESPECÍFICO";
export const FORNECEDOR_SUSPEITO = "COMPRA NÃO RECONHECIDA (ESTELIONATO)";

/** Fornecedores que não representam compra real de terceiro. */
export function normalizarFornecedor(raw?: string | null): string {
  const f = semAcento((raw ?? "").trim()).replace(/\s+/g, " ");
  if (!f) return SEM_FORNECEDOR;
  if (f.includes("PF COMERCIAL BRASIL")) return FORNECEDOR_SUSPEITO;
  if (f.includes("IMPORTADO") || f.startsWith("MATRIZ") || f === "ALMOX" || f.includes("ESTOQUE INTERNO")) {
    return SEM_FORNECEDOR;
  }
  if (f === "FME" || f.includes("EMPRESADEMO")
    || (f.includes("EMPRESA DEMO") && f.includes("MAQUINAS") && f.includes("EQUIPAMENTOS"))) {
    return "EMPRESA DEMO";
  }
  if (f.startsWith("VOX")) return "VOX COMERCIAL ATACADISTA DE PECAS";
  if (f.startsWith("BREV")) return "BREVIDIESEL";
  return f;
}

/* ------------- valor por item ------------- */

type ComValor = {
  valor_item?: number | null;
  numero_pedido_compra?: string | null;
  pedido?: { valor_total?: number | null } | null;
};

/** Nº de linhas por pedido, para ratear o valor do pedido quando não há valor do SAP. */
export function mapaLinhasPorPedido(items: ComValor[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of items) {
    const p = (s.numero_pedido_compra ?? "").trim();
    if (!p) continue;
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return m;
}

/** Valor real do item: o do SAP quando existe; senão rateio do valor do pedido. */
export function valorItem(s: ComValor, linhasPorPedido: Map<string, number>): number {
  const v = Number(s.valor_item ?? NaN);
  if (Number.isFinite(v) && v > 0) return v;
  const total = Number(s.pedido?.valor_total ?? 0) || 0;
  if (!total) return 0;
  const p = (s.numero_pedido_compra ?? "").trim();
  const n = p ? (linhasPorPedido.get(p) ?? 1) : 1;
  return total / Math.max(1, n);
}

/* ------------- tipo de peça (árvore de famílias) ------------- */

const TIPOS_PECA: [RegExp, string][] = [
  [/ELETROVENTILADOR|VENTILADOR UNIVERSAL/, "AR-CONDICIONADO"],
  [/CONDENSADOR/, "CONDENSADOR"],
  [/COMPRESSOR/, "COMPRESSOR"],
  [/EVAPORADOR/, "EVAPORADOR"],
  [/SECADOR|DESIDRATADOR/, "FILTRO SECADOR / DESIDRATADOR"],
  [/GAS R134|R134|GAS REFRIG/, "GÁS REFRIGERANTE"],
  [/\bANEL\b|ANEL O|RETENCAO|\bSELO\b|VEDANTE|VEDACAO/, "JUNTA / VEDAÇÃO"],
  [/CONTROLADOR|TERMINAL/, "COMPONENTE ELETRÔNICO"],
  [/LAMINA|\bUNHA|\bPINO|BORDA|\bCANTO/, "MATERIAL DE DESGASTE"],
  [/RODA MACICA/, "PNEU / CÂMARA"],

  [/FILTRO DE OLEO|FILTRO OLEO|FILTRO LUB/, "FILTRO DE ÓLEO"],
  [/FILTRO DE AR|FILTRO AR(?! CONDI)/, "FILTRO DE AR"],
  [/FILTRO COMBUST|FILTRO DIESEL|FILTRO SEPARADOR|RACOR/, "FILTRO DE COMBUSTÍVEL"],
  [/FILTRO HIDRAUL/, "FILTRO HIDRÁULICO"],
  [/FILTRO ARLA/, "FILTRO ARLA"],
  [/FILTRO/, "FILTRO (OUTROS)"],
  [/CORREIA/, "CORREIA"],
  [/RETENTOR|VEDADOR/, "RETENTOR"],
  [/JUNTA|GAXETA|ANEL O/, "JUNTA / VEDAÇÃO"],
  [/MANGUEIRA|FLEXIVEL/, "MANGUEIRA"],
  [/LAMPADA/, "LÂMPADA"],
  [/LANTERNA/, "LANTERNA"],
  [/FAROL/, "FAROL"],
  [/CHICOTE/, "CHICOTE"],
  [/RELE|FUSIVEL/, "RELÉ / FUSÍVEL"],
  [/SENSOR/, "SENSOR"],
  [/BATERIA/, "BATERIA"],
  [/ALTERNADOR/, "ALTERNADOR"],
  [/MOTOR DE PARTIDA/, "MOTOR DE PARTIDA"],
  [/OLEO|LUBRIFICANTE|GRAXA|FLUIDO/, "ÓLEO / LUBRIFICANTE"],
  [/PARAFUSO|PORCA|ARRUELA/, "FIXADORES"],
  [/ROLAMENTO|MANCAL/, "ROLAMENTO"],
  [/PNEU|CAMARA/, "PNEU / CÂMARA"],
];

export function tipoPecaDe(descricao: string): string {
  const t = semAcento(descricao).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, nome] of TIPOS_PECA) if (re.test(t)) return nome;
  return t.split(" ")[0] || "OUTROS";
}
