import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LinhaEstoque = {
  codigo_sap: string;
  descricao: string | null;
  locacao: string | null;
  qtd: number;
  desenho_engeman: string | null;
  referencia_fabrica: string | null;
  descricao_antiga: string | null;
  novo_cod: string | null;
};

export const importarEstoqueAlmox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linhas: LinhaEstoque[]; substituirTudo?: boolean }) => {
    const linhas = Array.isArray(input?.linhas) ? input.linhas : [];
    if (linhas.length === 0) throw new Error("Nenhuma linha para importar");
    if (linhas.length > 20000) throw new Error("Arquivo muito grande (máx. 20.000 linhas)");
    const limpas: LinhaEstoque[] = [];
    for (const l of linhas) {
      const codigo = String(l?.codigo_sap ?? "").trim().toUpperCase();
      if (!codigo) continue;
      const qtdNum = Number(l?.qtd ?? 0);
      limpas.push({
        codigo_sap: codigo.slice(0, 60),
        descricao: l?.descricao ? String(l.descricao).trim().toUpperCase().slice(0, 300) : null,
        locacao: l?.locacao ? String(l.locacao).trim().toUpperCase().slice(0, 60) : null,
        qtd: Number.isFinite(qtdNum) ? qtdNum : 0,
        desenho_engeman: l?.desenho_engeman ? String(l.desenho_engeman).trim().slice(0, 120) : null,
        referencia_fabrica: l?.referencia_fabrica ? String(l.referencia_fabrica).trim().toUpperCase().slice(0, 120) : null,
        descricao_antiga: l?.descricao_antiga ? String(l.descricao_antiga).trim().toUpperCase().slice(0, 300) : null,
        novo_cod: l?.novo_cod ? String(l.novo_cod).trim().toUpperCase().slice(0, 60) : null,
      });
    }
    if (limpas.length === 0) throw new Error("Nenhuma linha válida (código SAP vazio)");
    return { linhas: limpas, substituirTudo: input?.substituirTudo !== false };
  })
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isPcm }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "pcm" }),
    ]);
    if (!isAdmin && !isPcm) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // dedup por código (mantém a última ocorrência)
    const mapa = new Map<string, LinhaEstoque>();
    for (const l of data.linhas) mapa.set(l.codigo_sap, l);
    const linhas = [...mapa.values()];

    let gravadas = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500).map((l) => ({ ...l, updated_at: new Date().toISOString() }));
      const { error } = await supabaseAdmin
        .from("materiais_almox")
        .upsert(lote, { onConflict: "codigo_sap" });
      if (error) throw new Error(error.message);
      gravadas += lote.length;
    }

    let removidas = 0;
    if (data.substituirTudo) {
      const codigos = new Set(linhas.map((l) => l.codigo_sap));
      const { data: existentes, error } = await supabaseAdmin
        .from("materiais_almox")
        .select("codigo_sap")
        .limit(50000);
      if (error) throw new Error(error.message);
      const obsoletos = (existentes ?? [])
        .map((r) => r.codigo_sap)
        .filter((c) => !codigos.has(c));
      for (let i = 0; i < obsoletos.length; i += 500) {
        const lote = obsoletos.slice(i, i + 500);
        const { error: delErr } = await supabaseAdmin
          .from("materiais_almox")
          .delete()
          .in("codigo_sap", lote);
        if (delErr) throw new Error(delErr.message);
        removidas += lote.length;
      }
    }

    return { gravadas, removidas, comSaldo: linhas.filter((l) => l.qtd > 0).length };
  });
