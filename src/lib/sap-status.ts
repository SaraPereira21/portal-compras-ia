/** Regras compartilhadas para interpretar os relatórios do SAP. */

export const semAcentoSap = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

export const DIRETOR_PADRAO = "VICTOR MARINHO";

const COORDENADORES: Record<string, string> = {
  "JOYCE ALMEIDA": "BRUNO CROCCI",
  "DAYVSON LUIZ ALVEZ BEZERRA": "BRUNO CROCCI",
  "NYVANDRO ALMEIDA": "BRUNO CROCCI",
  "ROBSON ANTONIO": "BRUNO CROCCI",
  "JORGE SANTIAGO": "JUAN DOURADO",
  "PAULO MARCIO GARCIA": "BRUNO CROCCI",
};

export type Autorizador = {
  nivel: "COORD" | "GERENTE" | "DIRETORIA";
  coordenador: string | null;
  gerente: string | null;
  diretor: string;
};

/** Identifica quem autorizou no SAP e o nível dele na alçada. */
export function identificarAutorizador(nome: unknown): Autorizador {
  const n = semAcentoSap(nome);
  const toks = new Set(n.split(/[^A-Z]+/).filter(Boolean));
  if (toks.has("VICTOR") && toks.has("MARINHO")) {
    return { nivel: "DIRETORIA", coordenador: null, gerente: null, diretor: DIRETOR_PADRAO };
  }
  if (toks.has("BRUNO") && toks.has("CROCCI")) {
    return { nivel: "GERENTE", coordenador: null, gerente: "BRUNO CROCCI", diretor: DIRETOR_PADRAO };
  }
  if (toks.has("JUAN") && (toks.has("DOURADO") || toks.has("RAPOSO"))) {
    return { nivel: "GERENTE", coordenador: null, gerente: "JUAN DOURADO", diretor: DIRETOR_PADRAO };
  }
  let melhor: string | null = null;
  let pontos = 0;
  for (const c of Object.keys(COORDENADORES)) {
    const p = c.split(" ").filter((t) => toks.has(t)).length;
    if (p > pontos) { pontos = p; melhor = c; }
  }
  if (melhor && pontos >= 1) {
    return { nivel: "COORD", coordenador: melhor, gerente: COORDENADORES[melhor] ?? null, diretor: DIRETOR_PADRAO };
  }
  return { nivel: "COORD", coordenador: n || null, gerente: null, diretor: DIRETOR_PADRAO };
}

/** Situações que nunca voltam atrás por causa do SAP. */
export const STATUS_TERMINAL = new Set([
  "RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA", "CANCELADA_SUPERVISOR", "REPROVADA", "CANCELADA",
]);

/** Converte o status do SAP na situação usada no portal (null = não mexer). */
export function statusDoSap(status: unknown, statusAutorizacao: unknown, nivel: Autorizador["nivel"]): string | null {
  const st = semAcentoSap(status);
  const sa = semAcentoSap(statusAutorizacao);
  if (sa.startsWith("REJEITADO")) return "PEDIDO_REPROVADO_GESTAO";
  if (sa.startsWith("EM APROVACAO") || st.startsWith("EM AUTORIZACAO")) {
    if (nivel === "DIRETORIA") return "PEDIDO_EM_APROVACAO_DIRETORIA";
    if (nivel === "GERENTE") return "PEDIDO_EM_APROVACAO_GERENTE";
    return "PEDIDO_EM_APROVACAO_COORD";
  }
  if (st.startsWith("DOCUMENTOS")) return "PEDIDO_COLOCADO";
  if (st.startsWith("ESBOCO")) return null;
  return "PEDIDO_APROVADO_GESTAO";
}
