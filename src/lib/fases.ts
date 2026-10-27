// Regra única de "RC sem pedido", usada no Acompanhamento do PCM e no Painel do Gestor.
export type ItemFase = {
  status: string;
  rc_numero?: string | null;
  numero_pedido_compra?: string | null;
  em_cadastro?: boolean | null;
  reserva_numero?: string | null;
};

export const temPedidoDe = (s: ItemFase) =>
  !!(s.numero_pedido_compra && String(s.numero_pedido_compra).trim());

export const temRcTratada = (s: ItemFase) =>
  !!(s.rc_numero && String(s.rc_numero).trim()) && !s.em_cadastro;

/** Peça com RC já gerada pelo PCM e ainda sem número de pedido de compra. */
export const isRcSemPedido = (s: ItemFase) =>
  !(s.reserva_numero && String(s.reserva_numero).trim()) &&
  temRcTratada(s) &&
  !temPedidoDe(s) &&
  (s.status === "EM_TRATAMENTO_PCM" || s.status === "PEDIDO_APROVADO_GESTAO");
