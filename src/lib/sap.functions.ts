import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AjusteSap = {
  id: string;
  valor_item: number;
  numero_pedido_compra?: string | null;
  fornecedor?: string | null;
};

/** Aplica em lote os valores por item (e fornecedor, quando vier) do relatório do SAP. */
export const aplicarAjustesSap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ajustes: AjusteSap[] }) => {
    if (!Array.isArray(input?.ajustes) || input.ajustes.length === 0) {
      throw new Error("Nada para aplicar.");
    }
    if (input.ajustes.length > 5000) throw new Error("Lote muito grande.");
    return input;
  })
  .handler(async ({ data, context }) => {
    let ok = 0;
    for (const a of data.ajustes) {
      const patch: Record<string, unknown> = {
        valor_item: Number(a.valor_item),
        sap_conferido_at: new Date().toISOString(),
      };
      if (a.numero_pedido_compra) patch["numero_pedido_compra"] = a.numero_pedido_compra;
      if (a.fornecedor) patch["fornecedor"] = a.fornecedor;
      const { error } = await context.supabase
        .from("solicitacoes")
        .update(patch as never)
        .eq("id", a.id);
      if (error) throw new Error(error.message);
      ok += 1;
    }
    return { atualizados: ok };
  });

export type PedidoSap = {
  numero: string;
  valor: number;
  fornecedor: string | null;
  status: string | null;
  coordenador: string | null;
  gerente: string | null;
  diretor: string | null;
  data: string | null;
};

const TERMINAIS = ["RECEBIDA_ALMOX", "ENTREGUE_MECANICO", "FINALIZADA", "CANCELADA_SUPERVISOR", "REPROVADA", "CANCELADA"];

/** Aplica o relatório de pedidos do SAP: valor total, fornecedor, aprovadores, datas e situação. */
export const aplicarPedidosSap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedidos: PedidoSap[] }) => {
    if (!Array.isArray(input?.pedidos) || input.pedidos.length === 0) throw new Error("Nada para aplicar.");
    if (input.pedidos.length > 2000) throw new Error("Lote muito grande.");
    return input;
  })
  .handler(async ({ data, context }) => {
    let pedidosAtualizados = 0;
    let pecasAtualizadas = 0;
    const naoEncontrados: string[] = [];

    for (const p of data.pedidos) {
      const numero = String(p.numero || "").replace(/\D/g, "");
      if (!numero) continue;
      const dataIso = p.data ? new Date(`${p.data}T12:00:00Z`).toISOString() : null;

      const { data: pcs } = await context.supabase
        .from("pedidos_compra").select("id, comprador_at").eq("numero_pedido_compra", numero);
      for (const pc of pcs ?? []) {
        const patch: Record<string, unknown> = { valor_total: p.valor };
        if (p.fornecedor) patch["fornecedor"] = p.fornecedor;
        if (p.coordenador) patch["coordenador"] = p.coordenador;
        if (p.gerente) patch["gerente"] = p.gerente;
        if (p.diretor) patch["diretor"] = p.diretor;
        if (dataIso && !pc.comprador_at) patch["comprador_at"] = dataIso;
        const { error } = await context.supabase.from("pedidos_compra").update(patch as never).eq("id", pc.id);
        if (error) throw new Error(error.message);
        pedidosAtualizados += 1;
      }

      const { data: itens } = await context.supabase
        .from("solicitacoes")
        .select("id, status, valor_item, comprador_at, aprovador_gestao_at")
        .eq("numero_pedido_compra", numero);
      if (!itens?.length) { naoEncontrados.push(numero); continue; }

      const pesos = itens.map((i) => Math.max(0, Number(i.valor_item ?? 0)));
      const soma = pesos.reduce((a, b) => a + b, 0);
      for (let k = 0; k < itens.length; k++) {
        const it = itens[k]!;
        const frac = soma > 0.01 ? (pesos[k]! / soma) : 1 / itens.length;
        const patch: Record<string, unknown> = {
          valor_item: Math.round(p.valor * frac * 100) / 100,
          sap_conferido_at: new Date().toISOString(),
        };
        if (p.fornecedor) patch["fornecedor"] = p.fornecedor;
        if (dataIso && !it.comprador_at) patch["comprador_at"] = dataIso;
        if (p.status && !TERMINAIS.includes(String(it.status))) {
          patch["status"] = p.status;
          if (p.status.startsWith("PEDIDO_EM_APROVACAO") && !it.aprovador_gestao_at && dataIso) {
            patch["aprovador_gestao_at"] = dataIso;
          }
        }
        const { error } = await context.supabase.from("solicitacoes").update(patch as never).eq("id", it.id);
        if (error) throw new Error(error.message);
        pecasAtualizadas += 1;
      }
    }
    return { pedidosAtualizados, pecasAtualizadas, naoEncontrados };
  });

export type LinhaRcSap = { rc: string; material: string; texto: string; pedido: string };

/** Corrige o vínculo peça → pedido usando o relatório de RCs do SAP. */
export const aplicarVinculoRcSap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linhas: LinhaRcSap[] }) => {
    if (!Array.isArray(input?.linhas) || input.linhas.length === 0) throw new Error("Nada para aplicar.");
    if (input.linhas.length > 20000) throw new Error("Lote muito grande.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const norm = (s: unknown) =>
      String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    const chave = (rc: string, mat: string) => `${rc}|${mat.replace(/\D/g, "")}`;
    const mapa = new Map<string, string>();
    for (const l of data.linhas) {
      const rc = String(l.rc || "").trim();
      if (!rc) continue;
      const ped = String(l.pedido || "").replace(/\D/g, "");
      const k = chave(rc, String(l.material || ""));
      if (ped && !mapa.get(k)) mapa.set(k, ped);
      const kt = `${rc}|T|${norm(l.texto)}`;
      if (ped && !mapa.get(kt)) mapa.set(kt, ped);
    }

    const rcs = Array.from(new Set(data.linhas.map((l) => String(l.rc || "").trim()).filter(Boolean)));
    let vinculadas = 0;
    let semPedido = 0;
    for (let i = 0; i < rcs.length; i += 200) {
      const fatia = rcs.slice(i, i + 200);
      const { data: itens, error } = await context.supabase
        .from("solicitacoes")
        .select("id, rc_numero, codigo_peca, descricao, numero_pedido_compra, status")
        .in("rc_numero", fatia);
      if (error) throw new Error(error.message);
      for (const it of itens ?? []) {
        const rc = String(it.rc_numero ?? "").trim();
        const ped = mapa.get(chave(rc, String(it.codigo_peca ?? "")))
          ?? mapa.get(`${rc}|T|${norm(it.descricao)}`);
        if (!ped) { semPedido += 1; continue; }
        if (String(it.numero_pedido_compra ?? "").replace(/\D/g, "") === ped) continue;
        const { error: e2 } = await context.supabase
          .from("solicitacoes").update({ numero_pedido_compra: ped } as never).eq("id", it.id);
        if (e2) throw new Error(e2.message);
        vinculadas += 1;
      }
    }
    return { vinculadas, semPedido };
  });
