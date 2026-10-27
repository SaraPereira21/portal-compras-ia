export type Aprovador = {
  bu: string;
  coordenador: string;
  gerente: string;
  diretor: string;
};

export const DIRETOR = "VICTOR MARINHO";

// Estrutura de alçadas: coordenador (aprovador imediato) → gerente → diretor
export const APROVADORES: Aprovador[] = [
  { bu: "", coordenador: "JOYCE ALMEIDA", gerente: "BRUNO CROCCI", diretor: DIRETOR },
  { bu: "", coordenador: "DAYVSON LUIZ ALVEZ BEZERRA", gerente: "BRUNO CROCCI", diretor: DIRETOR },
  { bu: "", coordenador: "NYVANDRO ALMEIDA", gerente: "BRUNO CROCCI", diretor: DIRETOR },
  { bu: "", coordenador: "ROBSON ANTONIO", gerente: "BRUNO CROCCI", diretor: DIRETOR },
  { bu: "", coordenador: "JORGE SANTIAGO", gerente: "JUAN DOURADO", diretor: DIRETOR },
  { bu: "", coordenador: "PAULO MARCIO GARCIA", gerente: "BRUNO CROCCI", diretor: DIRETOR },
].sort((a, b) => a.coordenador.localeCompare(b.coordenador));

export function aprovadorPorCoordenador(coordenador: string | null | undefined): Aprovador | null {
  if (!coordenador) return null;
  const alvo = coordenador.trim().toUpperCase();
  return APROVADORES.find((a) => a.coordenador === alvo) ?? null;
}

// Nome de quem está com o pedido no momento, conforme o status
export function aprovadorAtual(
  status: string,
  pedido: { coordenador?: string | null; gerente?: string | null; diretor?: string | null } | null | undefined,
): { nivel: string; nome: string } | null {
  if (status === "PEDIDO_EM_APROVACAO_COORD") return { nivel: "Coordenador", nome: pedido?.coordenador?.trim() || "—" };
  if (status === "PEDIDO_EM_APROVACAO_GERENTE") return { nivel: "Gerente", nome: pedido?.gerente?.trim() || "—" };
  if (status === "PEDIDO_EM_APROVACAO_DIRETORIA") return { nivel: "Diretoria", nome: pedido?.diretor?.trim() || DIRETOR };
  return null;
}
