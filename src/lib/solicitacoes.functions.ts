import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// Leitura server-side de dados operacionais (não expostos ao público via RLS)
async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Retorna true somente quando a chamada traz um token válido de usuário logado.
async function chamadaAutenticada(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const auth = req?.headers?.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return false;
    const token = auth.slice(7);
    if (token.split(".").length !== 3) return false;
    const sb = publicClient();
    const { data, error } = await sb.auth.getClaims(token);
    return !error && !!data?.claims?.sub;
  } catch {
    return false;
  }
}

// Remove dados financeiros/comerciais e a cadeia de aprovação para visitantes sem login.
function sanitizarParaPublico<T extends Record<string, any>>(linha: T): T {
  const pedido = linha.pedido
    ? {
        ...linha.pedido,
        valor_total: null,
        fornecedor: null,
        bu: null,
        coordenador: null,
        gerente: null,
        diretor: null,
      }
    : linha.pedido;
  return {
    ...linha,
    valor_total: null,
    valor_item: null,
    fornecedor: null,
    orcamento_path: null,
    pedido_compra_path: null,
    observacoes_pcm: null,
    aprovador_gestao_id: null,
    comprador_id: null,
    pcm_id: null,
    supervisor_id: null,
    tratativa_por: null,
    tratativa_por_nome: null,
    pedido,
  };
}

function normalizarCodigo(v: string) {
  return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export const listSolicitantes = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("solicitantes")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listEquipamentos = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  // Paginate to bypass PostgREST 1000-row cap
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from("equipamentos")
      .select("id, prefixo_interno, codigo_armac, descricao")
      .eq("ativo", true)
      .order("prefixo_interno")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
});

// Lista as últimas OSs já usadas para uma máquina (para sugerir no formulário)
export const listOsDoEquipamento = createServerFn({ method: "POST" })
  .inputValidator((d: { equipamento_id: string }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.equipamento_id)) throw new Error("Máquina inválida.");
    return d;
  })
  .handler(async ({ data }) => {
    const sb = await adminClient();
    const { data: rows, error } = await sb
      .from("solicitacoes")
      .select("os_numero, created_at")
      .eq("equipamento_id", data.equipamento_id)
      .not("os_numero", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const out: { os_numero: string; created_at: string }[] = [];
    for (const r of rows ?? []) {
      const os = (r.os_numero || "").trim().toUpperCase();
      if (!os || seen.has(os)) continue;
      seen.add(os);
      out.push({ os_numero: os, created_at: r.created_at as string });
      if (out.length >= 8) break;
    }
    return out;
  });


export const checkDuplicidade = createServerFn({ method: "POST" })
  .inputValidator((d: { codigo_peca?: string | null; descricao: string; equipamento_id?: string | null }) => d)
  .handler(async ({ data }) => {
    const vazio = { encontrou: false, tipo: null, itens: [] as never[] };
    // Regra: só alerta quando for exatamente o MESMO código de peça E a MESMA máquina.
    if (!data.codigo_peca || !data.codigo_peca.trim() || !data.equipamento_id) return vazio;

    const sb = await adminClient();
    const desde = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const norm = normalizarCodigo(data.codigo_peca);
    if (!norm) return vazio;

    const { data: byCode } = await sb
      .from("solicitacoes")
      .select("id, os_numero, created_at, descricao, codigo_peca, quantidade, status, equipamento_id")
      .eq("codigo_peca_normalizado", norm)
      .eq("equipamento_id", data.equipamento_id)
      .not("status", "in", "(CANCELADA_SUPERVISOR,PEDIDO_REPROVADO_GESTAO,REPROVADA,CANCELADA)")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5);

    if (byCode && byCode.length > 0) return { encontrou: true, tipo: "codigo" as const, itens: byCode };
    return vazio;
  });


export type NovaSolicitacaoInput = {
  solicitante_id: string;
  equipamento_id: string;
  equipamento_uso_id?: string | null;
  vai_para_outro?: boolean;
  os_numero: string;
  descricao: string;
  codigo_peca?: string | null;
  quantidade: number;
  unidade?: string | null;
  urgencia: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  observacoes_gerais?: string | null;
  justificativa_duplicidade?: string | null;
  foto_peca_path?: string | null;
  pode_ser_paralela?: boolean;
};

export const criarSolicitacao = createServerFn({ method: "POST" })
  .inputValidator((d: NovaSolicitacaoInput) => d)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { error } = await sb
      .from("solicitacoes")
      .insert({
        solicitante_id: data.solicitante_id,
        equipamento_id: data.equipamento_id,
        equipamento_uso_id: data.equipamento_uso_id ?? null,
        vai_para_outro: data.vai_para_outro ?? false,
        os_numero: data.os_numero,
        descricao: data.descricao,
        codigo_peca: data.codigo_peca ?? null,

        quantidade: data.quantidade,
        unidade: data.unidade ?? "UN",
        urgencia: data.urgencia,
        observacoes_gerais: data.observacoes_gerais ?? null,
        justificativa_duplicidade: data.justificativa_duplicidade ?? null,
        duplicidade_detectada: !!data.justificativa_duplicidade,
        foto_peca_path: data.foto_peca_path ?? null,
        pode_ser_paralela: data.pode_ser_paralela ?? true,
        status: "SOLICITADA",
      });
    // Sem .select(): o papel anônimo não tem política de leitura em solicitacoes,
    // então pedir a linha de volta faria o envio falhar mesmo com o insert OK.
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const listSolicitacoes = createServerFn({ method: "POST" })
  .inputValidator((d: { status?: string[]; solicitante_id?: string; limit?: number; busca?: string } = {}) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (d.solicitante_id && !uuidRe.test(d.solicitante_id)) {
      throw new Error("Sessão inválida — selecione seu nome novamente.");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const sb = await adminClient();
    const logado = await chamadaAutenticada();
    const proteger = <L extends Record<string, any>>(linhas: L[]) =>
      logado ? linhas : linhas.map((l) => sanitizarParaPublico(l));
    let q = sb
      .from("solicitacoes")
      .select("*, solicitante:solicitantes(id, nome), equipamento:equipamentos!solicitacoes_equipamento_id_fkey(id, prefixo_interno, codigo_armac, descricao, modelo, numero_serie), equipamento_uso:equipamentos!solicitacoes_equipamento_uso_id_fkey(id, prefixo_interno, codigo_armac, descricao), pedido:pedidos_compra(id, numero_pedido_compra, valor_total, fornecedor, tipo_frete, transportadora, codigo_rastreio, link_rastreio, prazo_entrega, comprador_at, bu, coordenador, gerente, diretor)")
      .order("created_at", { ascending: false });
    if (data.status && data.status.length) q = q.in("status", data.status as never);
    if (data.solicitante_id) q = q.eq("solicitante_id", data.solicitante_id);
    if (data.busca && data.busca.trim().length >= 2) {
      const t = data.busca.trim().replace(/[%,()]/g, " ");
      const like = `%${t}%`;
      // Busca também por máquina (prefixo interno / código armac / descrição do equipamento)
      const { data: eqs } = await sb
        .from("equipamentos")
        .select("id")
        .or(`prefixo_interno.ilike.${like},codigo_armac.ilike.${like},descricao.ilike.${like}`)
        .limit(200);
      const eqIds = (eqs ?? []).map((e) => e.id);
      const orParts = [
        `os_numero.ilike.${like}`,
        `codigo_peca.ilike.${like}`,
        `descricao.ilike.${like}`,
        `rc_numero.ilike.${like}`,
        `numero_pedido_compra.ilike.${like}`,
        `fornecedor.ilike.${like}`,
      ];
      if (eqIds.length) orParts.push(`equipamento_id.in.(${eqIds.join(",")})`);
      q = q.or(orParts.join(",")).limit(100);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return proteger(rows ?? []);
    }

    // Paginação: o backend limita cada resposta a 1000 linhas,
    // então buscamos em blocos até completar o limite pedido.
    const alvo = Math.min(data.limit ?? 200, 5000);
    const passo = 1000;
    type Linha = NonNullable<Awaited<typeof q>["data"]>[number];
    const todas: Linha[] = [];
    for (let inicio = 0; inicio < alvo; inicio += passo) {
      const fim = Math.min(inicio + passo, alvo) - 1;
      const { data: rows, error } = await q.range(inicio, fim);
      if (error) throw new Error(error.message);
      const lote = (rows ?? []) as Linha[];
      todas.push(...lote);
      if (lote.length < fim - inicio + 1) break;
    }
    return proteger(todas);
  });


export const atualizarSolicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("solicitacoes").update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Atualiza várias peças de uma vez (evita atualização parcial quando uma linha falha). */
export const atualizarSolicitacoesEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; patch: Record<string, unknown> }) => {
    if (!Array.isArray(d.ids) || d.ids.length === 0) throw new Error("Nenhuma peça informada.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("solicitacoes")
      .update(data.patch as never)
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    const atualizadas = (rows ?? []).length;
    if (atualizadas < data.ids.length) {
      throw new Error(`Apenas ${atualizadas} de ${data.ids.length} peças foram atualizadas (sem permissão nas demais).`);
    }
    return { ok: true, atualizadas };
  });

export const atualizarPedidoCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pedidos_compra").update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Garante que as peças informadas estejam ligadas a um pedido de compra e aplica o patch nele.
 * Necessário porque solicitacoes.valor_total é zerado por trigger: o valor mora em pedidos_compra.
 */
export const salvarDadosPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; numero_pedido_compra?: string | null; patch: Record<string, unknown> }) => {
    if (!Array.isArray(d.ids) || d.ids.length === 0) throw new Error("Nenhuma peça informada.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const numero = data.numero_pedido_compra?.trim() ? data.numero_pedido_compra.trim().toUpperCase() : null;
    const { data: rows, error: readError } = await context.supabase
      .from("solicitacoes")
      .select("id, pedido_compra_id")
      .in("id", data.ids);
    if (readError) throw new Error(readError.message);

    let pedidoId: string | undefined;
    const vinculado = (rows ?? []).map((r) => r.pedido_compra_id).find(Boolean) as string | undefined;

    if (numero) {
      // Número informado manda: usa o pedido com esse número, se existir
      const { data: existente, error: findError } = await context.supabase
        .from("pedidos_compra")
        .select("id")
        .eq("numero_pedido_compra", numero)
        .limit(1);
      if (findError) throw new Error(findError.message);
      pedidoId = existente?.[0]?.id;
      if (!pedidoId && vinculado) {
        // Só renomeia o pedido vinculado se ele ainda não tinha número (senão afetaria peças de outro pedido)
        const { data: atual } = await context.supabase
          .from("pedidos_compra").select("numero_pedido_compra").eq("id", vinculado).maybeSingle();
        if (!atual?.numero_pedido_compra?.trim()) pedidoId = vinculado;
      }
    } else {
      pedidoId = vinculado;
    }

    if (pedidoId) {
      const { error } = await context.supabase
        .from("pedidos_compra")
        .update({ ...data.patch, ...(numero ? { numero_pedido_compra: numero } : {}) } as never)
        .eq("id", pedidoId);
      if (error) throw new Error(error.message);
    } else {
      const valor = Number(data.patch["valor_total"] ?? 0);
      if (!Number.isFinite(valor) || valor <= 0) throw new Error("Informe o valor do pedido.");
      const { data: novo, error } = await context.supabase
        .from("pedidos_compra")
        .insert({ ...data.patch, valor_total: valor, numero_pedido_compra: numero } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      pedidoId = novo.id;
    }

    const semVinculo = (rows ?? []).filter((r) => r.pedido_compra_id !== pedidoId).map((r) => r.id);
    if (semVinculo.length) {
      const { error } = await context.supabase
        .from("solicitacoes")
        .update({ pedido_compra_id: pedidoId } as never)
        .in("id", semVinculo);
      if (error) throw new Error(error.message);
    }
    return { ok: true, pedido_id: pedidoId };
  });

export type AlimentarPedidoCompraInput = {
  ids: string[];
  valor_total: number;
  fornecedor: string;
  numero_pedido_compra?: string | null;
  prazo_entrega?: string | null;
  prazo_dias_entrega?: number | null;
  tipo_frete: "LOCAL" | "TRANSPORTADORA";
  transportadora?: string | null;
  codigo_rastreio?: string | null;
  link_rastreio?: string | null;
  bu?: string | null;
  coordenador?: string | null;
  gerente?: string | null;
  diretor?: string | null;
  status: Database["public"]["Enums"]["solicitacao_status"];
};


export const alimentarPedidoCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AlimentarPedidoCompraInput) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!Array.isArray(d.ids) || d.ids.length === 0 || d.ids.some((id) => !uuidRe.test(id))) throw new Error("Selecione peças válidas para o pedido.");
    if (!Number.isFinite(Number(d.valor_total)) || Number(d.valor_total) <= 0) throw new Error("Informe o valor total do pedido.");
    if (!d.fornecedor?.trim()) throw new Error("Informe o fornecedor.");
    if (d.tipo_frete === "TRANSPORTADORA" && !d.transportadora?.trim()) throw new Error("Informe a transportadora.");
    if (d.status === "PEDIDO_COLOCADO" && !d.numero_pedido_compra?.trim()) throw new Error("Informe o Nº do Pedido de Compra para enviar ao fornecedor.");
    // Computa prazo automaticamente a partir de "dias após envio" + 1 dia de buffer, caso ainda não haja data explícita.
    const dias = d.prazo_dias_entrega != null && Number.isFinite(Number(d.prazo_dias_entrega)) ? Math.max(0, Math.floor(Number(d.prazo_dias_entrega))) : null;
    let prazo = d.prazo_entrega || null;
    if (d.status === "PEDIDO_COLOCADO" && !prazo && dias != null) {
      const base = new Date();
      base.setDate(base.getDate() + dias + 1);
      prazo = base.toISOString().slice(0, 10);
    }
    if (d.status === "PEDIDO_COLOCADO" && !prazo) throw new Error("Informe o prazo de entrega (ou selecione 'Entrega imediata' / dias após envio) para enviar ao fornecedor.");
    return {
      ...d,
      valor_total: Number(d.valor_total),
      fornecedor: d.fornecedor.trim().toUpperCase(),
      numero_pedido_compra: d.numero_pedido_compra?.trim() ? d.numero_pedido_compra.trim().toUpperCase() : null,
      transportadora: d.transportadora?.trim() ? d.transportadora.trim().toUpperCase() : null,
      codigo_rastreio: d.codigo_rastreio?.trim() || null,
      link_rastreio: d.link_rastreio?.trim() || null,
      prazo_entrega: prazo,
      prazo_dias_entrega: dias,
      bu: d.bu?.trim() ? d.bu.trim().toUpperCase() : null,
      coordenador: d.coordenador?.trim() ? d.coordenador.trim().toUpperCase() : null,
      gerente: d.gerente?.trim() ? d.gerente.trim().toUpperCase() : null,
      diretor: d.diretor?.trim() ? d.diretor.trim().toUpperCase() : null,
    };
  })

  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: rows, error: readError } = await context.supabase
      .from("solicitacoes")
      .select("id, pedido_compra_id")
      .in("id", data.ids);
    if (readError) throw new Error(readError.message);
    if ((rows ?? []).length !== data.ids.length) throw new Error("Uma ou mais peças não foram encontradas.");

    const pedidoIdsExistentes = Array.from(new Set((rows ?? []).map((r) => r.pedido_compra_id).filter(Boolean)));
    if (pedidoIdsExistentes.length > 1) throw new Error("As peças selecionadas pertencem a pedidos diferentes. Trate cada pedido separadamente.");

    let pedidoId = pedidoIdsExistentes[0] as string | undefined;
    const pedidoPayload = {
      numero_pedido_compra: data.numero_pedido_compra,
      valor_total: data.valor_total,
      fornecedor: data.fornecedor,
      tipo_frete: data.tipo_frete,
      transportadora: data.tipo_frete === "TRANSPORTADORA" ? data.transportadora : null,
      codigo_rastreio: data.codigo_rastreio,
      link_rastreio: data.link_rastreio,
      prazo_entrega: data.prazo_entrega,
      prazo_dias_entrega: data.prazo_dias_entrega,
      bu: data.bu,
      coordenador: data.coordenador,
      gerente: data.gerente,
      diretor: data.diretor,
      comprador_at: data.status === "PEDIDO_COLOCADO" ? now : null,
    };


    if (!pedidoId && data.numero_pedido_compra) {
      const { data: existente, error: findError } = await context.supabase
        .from("pedidos_compra")
        .select("id")
        .eq("numero_pedido_compra", data.numero_pedido_compra)
        .maybeSingle();
      if (findError) throw new Error(findError.message);
      pedidoId = existente?.id;
    }

    if (pedidoId) {
      const { error } = await context.supabase.from("pedidos_compra").update(pedidoPayload).eq("id", pedidoId);
      if (error) throw new Error(error.message);
    } else {
      const { data: novo, error } = await context.supabase.from("pedidos_compra").insert(pedidoPayload).select("id").single();
      if (error) throw new Error(error.message);
      pedidoId = novo.id;
    }

    const { error: updateError } = await context.supabase
      .from("solicitacoes")
      .update({
        pedido_compra_id: pedidoId,
        valor_total: null,
        fornecedor: data.fornecedor,
        numero_pedido_compra: data.numero_pedido_compra,
        prazo_entrega: data.prazo_entrega,
        tipo_frete: data.tipo_frete,
        transportadora: data.tipo_frete === "TRANSPORTADORA" ? data.transportadora : null,
        codigo_rastreio: data.codigo_rastreio,
        link_rastreio: data.link_rastreio,
        comprador_at: data.status === "PEDIDO_COLOCADO" ? now : null,
        // Início da contagem de "em aprovação": momento em que o pedido foi alimentado
        ...(String(data.status).startsWith("PEDIDO_EM_APROVACAO") ? { aprovador_gestao_at: now } : {}),
        status: data.status,
      } as never)
      .in("id", data.ids);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, pedido_id: pedidoId };
  });

// Confirmação de recebimento pelo próprio solicitante (fluxo anônimo)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const confirmarRecebimentoSolicitante = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; solicitante_id: string; nome: string }) => {
    if (!UUID_RE.test(d.solicitante_id)) throw new Error("Sessão inválida — selecione seu nome novamente.");
    if (!UUID_RE.test(d.id)) throw new Error("Solicitação inválida.");
    return { ...d, nome: d.nome.trim().toUpperCase().slice(0, 120) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: e1 } = await supabaseAdmin
      .from("solicitacoes")
      .select("id, solicitante_id, status")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    if (row.solicitante_id !== data.solicitante_id) throw new Error("Solicitação não pertence a este solicitante");
    if (row.status !== "RECEBIDA_ALMOX") throw new Error("Status inválido para confirmação");
    const { error } = await supabaseAdmin.from("solicitacoes").update({
      status: "ENTREGUE_MECANICO",
      data_entrega_mecanico: new Date().toISOString(),
      observacao_retirada: data.nome ? `RECEBIMENTO FÍSICO CONFIRMADO POR ${data.nome}` : "RECEBIMENTO FÍSICO CONFIRMADO PELO SOLICITANTE",
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Solicitante aponta que a peça NÃO chegou (ou veio incompleta) → volta para EM TRÂNSITO
export const apontarNaoRecebidoSolicitante = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; solicitante_id: string; nome: string; quantidade_recebida?: number | null; motivo?: string | null }) => {
    if (!UUID_RE.test(d.solicitante_id)) throw new Error("Sessão inválida — selecione seu nome novamente.");
    if (!UUID_RE.test(d.id)) throw new Error("Solicitação inválida.");
    return {
      ...d,
      nome: d.nome.trim().toUpperCase().slice(0, 120),
      motivo: d.motivo?.trim().toUpperCase().slice(0, 300) ?? null,
      quantidade_recebida:
        d.quantidade_recebida === null || d.quantidade_recebida === undefined || Number.isNaN(Number(d.quantidade_recebida))
          ? null
          : Number(d.quantidade_recebida),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: e1 } = await supabaseAdmin
      .from("solicitacoes")
      .select("id, solicitante_id, status, quantidade, observacao_recebimento")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    if (row.solicitante_id !== data.solicitante_id) throw new Error("Solicitação não pertence a este solicitante");
    if (row.status !== "RECEBIDA_ALMOX") throw new Error("Só é possível apontar falta de peça recebida no almoxarifado");

    const qtdRec = data.quantidade_recebida;
    const partes = [
      `⚠ NÃO RECEBIDO — APONTADO POR ${data.nome || "SOLICITANTE"} EM ${new Date().toLocaleString("pt-BR")}`,
      qtdRec !== null ? `RECEBIDO ${qtdRec} DE ${row.quantidade}` : "NENHUMA PEÇA ENCONTRADA NO ALMOXARIFADO",
      data.motivo ? `MOTIVO: ${data.motivo}` : null,
    ].filter(Boolean);
    const historico = [row.observacao_recebimento, partes.join(" · ")].filter(Boolean).join("\n");

    const { error } = await supabaseAdmin.from("solicitacoes").update({
      status: "PEDIDO_COLOCADO",
      data_recebimento_almox: null,
      observacao_recebimento: historico,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Solicitante corrige código/descrição de peça devolvida como pendência
export const corrigirPendenciaSolicitante = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; solicitante_id: string; codigo_peca: string; descricao: string; observacao?: string | null }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: e1 } = await supabaseAdmin
      .from("solicitacoes")
      .select("id, solicitante_id, status")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    if (row.solicitante_id !== data.solicitante_id) throw new Error("Solicitação não pertence a este solicitante");
    if (row.status !== "PENDENCIA_SOLICITANTE") throw new Error("Peça não está em pendência");
    if (!data.codigo_peca.trim() || !data.descricao.trim()) throw new Error("Código e descrição são obrigatórios");
    const { error } = await supabaseAdmin.from("solicitacoes").update({
      codigo_peca: data.codigo_peca.trim().toUpperCase(),
      descricao: data.descricao.trim().toUpperCase(),
      observacoes_gerais: data.observacao?.trim() ? data.observacao.trim().toUpperCase() : null,
      status: "SOLICITADA",
      pcm_motivo_pendencia: null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Extrai itens (peças) de um PDF de orçamento via Lovable AI Gateway.
// Entrada: PDF em base64 (data URL). Saída: lista de itens no formato do lote.
export const extrairItensDeOrcamento = createServerFn({ method: "POST" })
  .inputValidator((d: { file_name: string; mime_type: string; data_base64: string }) => {
    if (!d.data_base64 || d.data_base64.length < 100) throw new Error("Arquivo inválido.");
    const isPdf = /^application\/pdf$/i.test(d.mime_type);
    const isImg = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(d.mime_type);
    if (!isPdf && !isImg) throw new Error("Envie um PDF ou uma imagem (JPG/PNG/WEBP) do orçamento.");
    // Limite de segurança ~8MB base64 (~6MB arquivo)
    if (d.data_base64.length > 8 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. ~6MB).");
    return d;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("IA não configurada no ambiente.");
    const isPdf = /^application\/pdf$/i.test(data.mime_type);
    const dataUrl = `data:${data.mime_type};base64,${data.data_base64}`;
    const mediaBlock = isPdf
      ? { type: "file", file: { filename: data.file_name || "orcamento.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };
    const body = {
      model: "openai/gpt-5.5",
      messages: [
        {
          role: "system",
          content:
            "Você extrai itens de orçamentos de peças (compras industriais) em português. Devolva SOMENTE JSON no formato pedido, sem texto extra. Ignore linhas de total, frete, imposto, seguro, cabeçalho, dados do fornecedor e valores. Não invente itens. Descrições e códigos devem vir em CAIXA ALTA.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                'Extraia as peças deste orçamento (PDF ou foto). Responda estritamente no formato:\n' +
                '{"itens":[{"codigo_peca":"...","descricao":"...","quantidade":1,"unidade":"UN"}, ...]}\n' +
                'Regras:\n' +
                '- "codigo_peca": use a REFERÊNCIA / código do fornecedor (NUNCA o NCM). Se não houver, deixe string vazia.\n' +
                '- "descricao": descrição da peça em CAIXA ALTA (sem valores/quantidades).\n' +
                '- "quantidade": número inteiro >= 1 (converta "2,00" -> 2).\n' +
                '- "unidade": UN, PC, KG, L, M etc.; padrão "UN".\n' +
                '- Ignore linhas de totais, frete, impostos, condições de pagamento.\n',
            },
            mediaBlock,
          ],
        },
      ],
      response_format: { type: "json_object" },
    };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Muitas requisições à IA. Tente de novo em 1 min.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha ao ler arquivo (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { throw new Error("Resposta da IA inválida."); }
    const arr = (parsed as { itens?: unknown }).itens;
    if (!Array.isArray(arr)) throw new Error("Nenhum item reconhecido no PDF.");
    const itens = arr
      .map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        const q = Number(o.quantidade);
        return {
          codigo_peca: String(o.codigo_peca ?? "").trim().toUpperCase(),
          descricao: String(o.descricao ?? "").trim().toUpperCase(),
          quantidade: Number.isFinite(q) && q > 0 ? Math.max(1, Math.floor(q)) : 1,
          unidade: (String(o.unidade ?? "UN").trim().toUpperCase() || "UN").slice(0, 12),
        };
      })
      .filter((x) => x.descricao.length > 0);
    return { itens };
  });




// ==================== Material de consumo ====================
export type NovoConsumoInput = {
  solicitante_id: string;
  equipamento_id?: string | null;
  os_numero?: string | null;
  material: string;
  quantidade: number;
  unidade?: string | null;
  observacao?: string | null;
};

export const criarConsumoMaterial = createServerFn({ method: "POST" })
  .inputValidator((d: NovoConsumoInput) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.solicitante_id)) throw new Error("Sessão inválida — selecione seu nome novamente.");
    if (d.equipamento_id && !uuidRe.test(d.equipamento_id)) throw new Error("Máquina inválida.");
    if (!d.material?.trim()) throw new Error("Informe o material.");
    const q = Number(d.quantidade);
    if (!Number.isFinite(q) || q <= 0) throw new Error("Quantidade inválida.");
    return {
      solicitante_id: d.solicitante_id,
      equipamento_id: d.equipamento_id || null,
      os_numero: d.os_numero?.trim() ? d.os_numero.trim().toUpperCase() : null,
      material: d.material.trim().toUpperCase().slice(0, 200),
      quantidade: q,
      unidade: (d.unidade?.trim() || "UN").toUpperCase().slice(0, 12),
      observacao: d.observacao?.trim() ? d.observacao.trim().toUpperCase() : null,
    };
  })
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Sem .select(): anônimo não tem política de leitura em consumo_materiais.
    const { error } = await sb.from("consumo_materiais").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CONSUMO_SELECT =
  "*, solicitante:solicitantes(id, nome), equipamento:equipamentos(id, prefixo_interno, codigo_armac, descricao)";

// Gestores autenticados (PCM/Almox)
export const listConsumoMateriais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { solicitante_id?: string; limit?: number } = {}) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (d.solicitante_id && !uuidRe.test(d.solicitante_id)) throw new Error("Sessão inválida.");
    return d;
  })
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("consumo_materiais")
      .select(CONSUMO_SELECT)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 300);
    if (data.solicitante_id) q = q.eq("solicitante_id", data.solicitante_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Mecânico (não autenticado): apenas os próprios registros
export const listMeusConsumos = createServerFn({ method: "POST" })
  .inputValidator((d: { solicitante_id: string; limit?: number }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.solicitante_id)) throw new Error("Sessão inválida.");
    return { solicitante_id: d.solicitante_id, limit: Math.min(d.limit ?? 100, 200) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("consumo_materiais")
      .select(CONSUMO_SELECT)
      .eq("solicitante_id", data.solicitante_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


// Mecânico edita o próprio registro enquanto ainda não foi reservado
export const editarMeuConsumo = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id: string;
    solicitante_id: string;
    material: string;
    quantidade: number;
    unidade?: string | null;
    equipamento_id?: string | null;
    os_numero?: string | null;
    observacao?: string | null;
  }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.id)) throw new Error("Registro inválido.");
    if (!uuidRe.test(d.solicitante_id)) throw new Error("Sessão inválida — selecione seu nome novamente.");
    if (d.equipamento_id && !uuidRe.test(d.equipamento_id)) throw new Error("Máquina inválida.");
    if (!d.material?.trim()) throw new Error("Informe o material.");
    const q = Number(d.quantidade);
    if (!Number.isFinite(q) || q <= 0) throw new Error("Quantidade inválida.");
    return {
      id: d.id,
      solicitante_id: d.solicitante_id,
      material: d.material.trim().toUpperCase().slice(0, 200),
      quantidade: q,
      unidade: (d.unidade?.trim() || "UN").toUpperCase().slice(0, 12),
      equipamento_id: d.equipamento_id || null,
      os_numero: d.os_numero?.trim() ? d.os_numero.trim().toUpperCase() : null,
      observacao: d.observacao?.trim() ? d.observacao.trim().toUpperCase() : null,
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, solicitante_id, ...patch } = data;
    const { data: atual, error: e1 } = await supabaseAdmin
      .from("consumo_materiais")
      .select("id, status, solicitante_id")
      .eq("id", id)
      .single();
    if (e1 || !atual) throw new Error("Registro não encontrado.");
    if (atual.solicitante_id !== solicitante_id) throw new Error("Este registro não é seu.");
    if ((atual.status ?? "SOLICITADO") !== "SOLICITADO")
      throw new Error("Este material já foi tratado pelo almoxarifado e não pode mais ser editado.");
    const { error } = await supabaseAdmin.from("consumo_materiais").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Mecânico confirma que retirou o material reservado no almoxarifado
export const confirmarRetiradaConsumo = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; solicitante_id: string }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.id)) throw new Error("Registro inválido.");
    if (!uuidRe.test(d.solicitante_id)) throw new Error("Sessão inválida — selecione seu nome novamente.");
    return { id: d.id, solicitante_id: d.solicitante_id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: e1 } = await supabaseAdmin
      .from("consumo_materiais")
      .select("id, status, solicitante_id")
      .eq("id", data.id)
      .single();
    if (e1 || !atual) throw new Error("Registro não encontrado.");
    if (atual.solicitante_id !== data.solicitante_id) throw new Error("Este registro não é seu.");
    if (atual.status !== "RESERVADO") throw new Error("Este material ainda não está reservado no almoxarifado.");
    const { error } = await supabaseAdmin
      .from("consumo_materiais")
      .update({ status: "ENTREGUE" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// PCM: material sem estoque vira requisição de compra (RC) na fila de tratativa
export const gerarRcDoConsumo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    equipamento_id: string;
    os_numero: string;
    codigo_peca?: string | null;
    rc_numero?: string | null;
  }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.id)) throw new Error("Registro inválido.");
    if (!uuidRe.test(d.equipamento_id)) throw new Error("Selecione a máquina.");
    if (!d.os_numero?.trim()) throw new Error("Informe a OS.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: consumo, error: e1 } = await context.supabase
      .from("consumo_materiais")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !consumo) throw new Error("Registro não encontrado.");
    const agora = new Date().toISOString();
    const { error: e2 } = await context.supabase.from("solicitacoes").insert({
      solicitante_id: consumo.solicitante_id,
      equipamento_id: data.equipamento_id,
      os_numero: data.os_numero.trim().toUpperCase(),
      descricao: String(consumo.material).toUpperCase(),
      codigo_peca: data.codigo_peca?.trim() ? data.codigo_peca.trim().toUpperCase() : null,
      quantidade: Math.max(1, Math.floor(Number(consumo.quantidade) || 1)),
      unidade: (consumo.unidade || "UN").toUpperCase().slice(0, 12),
      observacoes_gerais: `MATERIAL DE CONSUMO SEM ESTOQUE NO ALMOXARIFADO${consumo.observacao ? ` · ${consumo.observacao}` : ""}`,
      urgencia: "NORMAL",
      rc_numero: data.rc_numero?.trim() ? data.rc_numero.trim().toUpperCase() : null,
      status: "EM_TRATAMENTO_PCM",
      supervisor_at: agora,
      supervisor_id: context.userId,
      pcm_at: agora,
      pcm_id: context.userId,
    } as never);
    if (e2) throw new Error(e2.message);
    const { error: e3 } = await context.supabase
      .from("consumo_materiais")
      .update({ status: "COMPRA", tratado_por: context.userId, tratado_at: agora } as never)
      .eq("id", data.id);
    if (e3) throw new Error(e3.message);
    return { ok: true };
  });

export const atualizarConsumoMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status?: string; reserva_numero?: string | null; motivo?: string | null }) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.id)) throw new Error("Registro inválido.");
    if (d.status && !["SOLICITADO", "RESERVADO", "ENTREGUE", "COMPRA", "CANCELADO"].includes(d.status)) throw new Error("Situação inválida.");
    if (d.status === "RESERVADO" && !d.reserva_numero?.trim()) throw new Error("Informe o Nº da reserva.");
    if (d.status === "CANCELADO" && !d.motivo?.trim()) throw new Error("Informe o motivo do cancelamento.");

    return {
      id: d.id,
      status: d.status,
      reserva_numero: d.reserva_numero?.trim() ? d.reserva_numero.trim().toUpperCase() : null,
      motivo: d.motivo?.trim() ? d.motivo.trim().toUpperCase() : null,
    };
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      tratado_por: context.userId,
      tratado_at: new Date().toISOString(),
    };
    if (data.status) patch.status = data.status;
    if (data.reserva_numero !== undefined) patch.reserva_numero = data.reserva_numero;
    if (data.status === "CANCELADO" && data.motivo) {
      const { data: atual } = await context.supabase
        .from("consumo_materiais")
        .select("observacao")
        .eq("id", data.id)
        .maybeSingle();
      const base = (atual as { observacao?: string | null } | null)?.observacao?.trim();
      patch.observacao = `${base ? `${base} · ` : ""}CANCELADO: ${data.motivo}`;
    }
    const { error } = await context.supabase.from("consumo_materiais").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Criação retroativa de requisição pelo PCM (item que não subiu pelo app e já passou pelo supervisor)
export type NovaSolicitacaoPcmInput = {
  solicitante_id: string;
  equipamento_id: string;
  os_numero: string;
  descricao: string;
  codigo_peca?: string | null;
  quantidade: number;
  unidade?: string | null;
  rc_numero?: string | null;
  observacoes_gerais?: string | null;
  data_solicitacao: string; // YYYY-MM-DD
};

export const criarSolicitacaoPcm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: NovaSolicitacaoPcmInput) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(d.solicitante_id)) throw new Error("Selecione o solicitante.");
    if (!uuidRe.test(d.equipamento_id)) throw new Error("Selecione a máquina.");
    if (!d.os_numero?.trim()) d = { ...d, os_numero: "SEM OS" };
    if (!d.descricao?.trim()) throw new Error("Informe a descrição do material.");
    const qtd = Number(d.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) throw new Error("Quantidade inválida.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_solicitacao)) throw new Error("Informe a data da solicitação.");
    return { ...d, quantidade: qtd };
  })
  .handler(async ({ data, context }) => {
    const quando = new Date(`${data.data_solicitacao}T12:00:00Z`).toISOString();
    const rc = data.rc_numero?.trim() ? data.rc_numero.trim().toUpperCase() : null;
    const { data: inserted, error } = await context.supabase
      .from("solicitacoes")
      .insert({
        solicitante_id: data.solicitante_id,
        equipamento_id: data.equipamento_id,
        os_numero: data.os_numero.trim().toUpperCase(),
        descricao: data.descricao.trim().toUpperCase(),
        codigo_peca: data.codigo_peca?.trim() ? data.codigo_peca.trim().toUpperCase() : null,
        quantidade: Math.floor(data.quantidade),
        unidade: (data.unidade?.trim().toUpperCase() || "UN").slice(0, 12),
        observacoes_gerais: data.observacoes_gerais?.trim() ? data.observacoes_gerais.trim().toUpperCase() : null,
        urgencia: "NORMAL",
        rc_numero: rc,
        status: "EM_TRATAMENTO_PCM",
        created_at: quando,
        supervisor_at: quando,
        supervisor_id: context.userId,
        pcm_at: new Date().toISOString(),
        pcm_id: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });
