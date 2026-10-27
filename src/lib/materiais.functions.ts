import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


export type MaterialAlmox = {
  codigo_sap: string;
  descricao: string | null;
  locacao: string | null;
  qtd: number;
  referencia_fabrica: string | null;
  descricao_antiga: string | null;
};

export const buscarMateriaisAlmox = createServerFn({ method: "POST" })
  .inputValidator((input: { termo: string }) => {
    const termo = String(input?.termo ?? "").trim().slice(0, 80);
    if (termo.length < 2) throw new Error("Digite ao menos 2 caracteres");
    return { termo };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const like = `%${data.termo.replace(/[%,()*]/g, " ")}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("materiais_almox")
      .select("codigo_sap, descricao, locacao, qtd, referencia_fabrica, descricao_antiga")
      .or(
        `codigo_sap.ilike.${like},descricao.ilike.${like},referencia_fabrica.ilike.${like},descricao_antiga.ilike.${like}`,
      )
      .order("qtd", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MaterialAlmox[];
  });

export type MaterialSemGiro = {
  id: string;
  referencia: string;
  descricao: string | null;
  qtd: number;
  lote: string | null;
  tipo_produto: string | null;
};

/** Lotes de material sem giro — estoque fora do SAP (retirada por SAÍDA MANUAL). */
export const buscarMateriaisSemGiro = createServerFn({ method: "POST" })
  .inputValidator((input: { termo: string }) => {
    const termo = String(input?.termo ?? "").trim().slice(0, 80);
    if (termo.length < 2) throw new Error("Digite ao menos 2 caracteres");
    return { termo };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const like = `%${data.termo.replace(/[%,()*]/g, " ")}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("materiais_sem_giro")
      .select("id, referencia, descricao, qtd, lote, tipo_produto")
      .or(`referencia.ilike.${like},descricao.ilike.${like}`)
      .order("qtd", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MaterialSemGiro[];
  });

export type BaixaSemGiroInput = {
  material_id: string;
  quantidade: number;
  solicitante?: string | null;
  os_numero?: string | null;
  observacao?: string | null;
};

/** Baixa (SAÍDA MANUAL) de um lote sem giro: desconta o saldo e registra a retirada. */
export const darBaixaSemGiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: BaixaSemGiroInput) => {
    if (!d?.material_id) throw new Error("Lote não informado.");
    const quantidade = Number(d.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Informe uma quantidade maior que zero.");
    return {
      material_id: d.material_id,
      quantidade,
      solicitante: (d.solicitante ?? "").trim() || null,
      os_numero: (d.os_numero ?? "").trim() || null,
      observacao: (d.observacao ?? "").trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mat, error: eMat } = await supabaseAdmin
      .from("materiais_sem_giro")
      .select("id, referencia, descricao, lote, qtd")
      .eq("id", data.material_id)
      .maybeSingle();
    if (eMat) throw new Error(eMat.message);
    if (!mat) throw new Error("Lote não encontrado.");
    if (Number(mat.qtd) < data.quantidade)
      throw new Error(`Saldo insuficiente: há apenas ${mat.qtd} un. no lote.`);

    const novoSaldo = Number(mat.qtd) - data.quantidade;
    const { error: eUpd } = await supabaseAdmin
      .from("materiais_sem_giro")
      .update({ qtd: novoSaldo })
      .eq("id", mat.id)
      .gte("qtd", data.quantidade);
    if (eUpd) throw new Error(eUpd.message);

    const { error: eIns } = await supabaseAdmin.from("saidas_sem_giro").insert({
      material_id: mat.id,
      referencia: mat.referencia,
      descricao: mat.descricao,
      lote: mat.lote,
      quantidade: data.quantidade,
      solicitante: data.solicitante,
      os_numero: data.os_numero,
      observacao: data.observacao,
      baixado_por: context.userId,
    });
    if (eIns) throw new Error(eIns.message);

    return { ok: true, saldo: novoSaldo };
  });

export type SaidaSemGiro = {
  id: string;
  referencia: string;
  descricao: string | null;
  lote: string | null;
  quantidade: number;
  solicitante: string | null;
  os_numero: string | null;
  observacao: string | null;
  created_at: string;
};

/** Histórico das baixas feitas nos lotes sem giro. */
export const listSaidasSemGiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({ limit: Math.min(d?.limit ?? 200, 500) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("saidas_sem_giro")
      .select("id, referencia, descricao, lote, quantidade, solicitante, os_numero, observacao, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SaidaSemGiro[];
  });

