import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnexoEnvio = { filename: string; mime_type: string; data_base64: string };

export type EnviarPedidoInput = {
  pedido_compra_id?: string | null;
  numero_pedido_compra: string;
  fornecedor_id: string;
  assunto: string;
  corpo: string;
  corpo_html?: string;
  para: string[];
  cc: string[];
  anexos: AnexoEnvio[];
};

export const enviarPedidoAoFornecedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: EnviarPedidoInput) => {
    const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
    const para = (d.para ?? []).map((e) => e.trim()).filter(Boolean);
    const cc = (d.cc ?? []).map((e) => e.trim()).filter(Boolean);
    if (!para.length) throw new Error("Informe ao menos um e-mail de destino.");
    for (const e of [...para, ...cc]) if (!EMAIL_RE.test(e)) throw new Error(`E-mail inválido: ${e}`);
    if (!d.assunto?.trim()) throw new Error("Informe o assunto do e-mail.");
    if (!d.corpo?.trim() && !d.corpo_html?.trim()) throw new Error("Informe o corpo do e-mail.");
    const anexos = (d.anexos ?? []).filter((a) => a?.data_base64);
    const total = anexos.reduce((s, a) => s + a.data_base64.length, 0);
    if (total > 20 * 1024 * 1024) throw new Error("Anexos muito grandes (máx. ~14MB no total).");
    return { ...d, para, cc, anexos };
  })
  .handler(async ({ data, context }) => {
    const webhook = process.env.POWER_AUTOMATE_PEDIDO_URL;
    if (!webhook) throw new Error("Fluxo do Power Automate ainda não configurado (URL ausente).");

    const { data: cfg } = await context.supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "email_assinatura_html")
      .maybeSingle();
    const assinatura = (cfg?.valor as string | undefined) ?? "";

    const escapeHtml = (t: string) =>
      t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const linkify = (t: string) =>
      t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
    const normalizeHtml = (html: string) =>
      html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
        .replace(/\son[a-z]+="[^"]*"/gi, "")
        .replace(/\son[a-z]+='[^']*'/gi, "")
        .replace(/javascript:/gi, "")
        .trim();
    const htmlToText = (html: string) =>
      html
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const formatPlainText = (texto: string) =>
      texto
        .replace(/\u00a0/g, " ")
        .replace(/\r\n/g, "\n")
        .trim()
        .split(/\n{2,}/)
        .map((par) =>
          '<p style="margin:0 0 12px 0">' +
          linkify(escapeHtml(par)).replace(/\n/g, "<br />") +
          "</p>",
        )
        .join("");

    const htmlRecebido = normalizeHtml(data.corpo_html ?? "");
    const corpoBaseHtml = htmlRecebido || formatPlainText(data.corpo);
    const corpoTexto = htmlToText(corpoBaseHtml) || data.corpo.replace(/\u00a0/g, " ").trim();
    const corpoHtml =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">' +
      corpoBaseHtml +
      assinatura +
      "</div>";

    const payload = {
      numero_pedido_compra: data.numero_pedido_compra,
      assunto: data.assunto,
      corpo: corpoHtml,
      Corpo: corpoHtml,
      corpo_texto: corpoTexto,
      corpo_html: corpoHtml,
      corpoHtml,
      body: corpoHtml,
      Body: corpoHtml,
      HtmlBody: corpoHtml,
      htmlBody: corpoHtml,
      BodyHtml: corpoHtml,
      mensagem: corpoHtml,
      mensagem_html: corpoHtml,
      emailBody: corpoHtml,
      para: data.para.join(";"),
      Para: data.para.join(";"),
      cc: data.cc.join(";"),
      Cc: data.cc.join(";"),
      anexos: data.anexos.map((a) => ({
        Name: a.filename,
        name: a.filename,
        ContentBytes: a.data_base64,
        contentBytes: a.data_base64,
        nome: a.filename,
        tipo: a.mime_type,
        conteudo_base64: a.data_base64,
      })),
    };

    let status = "ENVIADO";
    let erro: string | null = null;
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        status = "ERRO";
        erro = `Power Automate respondeu ${res.status}: ${txt.slice(0, 400)}`;
      }
    } catch (e) {
      status = "ERRO";
      erro = (e as Error).message;
    }

    const { data: forn } = await context.supabase
      .from("fornecedores")
      .select("nome")
      .eq("id", data.fornecedor_id)
      .maybeSingle();

    await context.supabase.from("envios_pedido").insert({
      pedido_compra_id: data.pedido_compra_id ?? null,
      numero_pedido_compra: data.numero_pedido_compra,
      fornecedor_id: data.fornecedor_id,
      fornecedor_nome: forn?.nome ?? null,
      para: data.para,
      cc: data.cc,
      assunto: data.assunto,
      corpo: corpoTexto || htmlToText(corpoHtml),
      anexos: data.anexos.map((a) => ({ nome: a.filename, tipo: a.mime_type, bytes: Math.round((a.data_base64.length * 3) / 4) })),
      status,
      erro,
      enviado_por: context.userId,
    } as never);

    if (status === "ERRO") throw new Error(erro ?? "Falha no envio.");
    return { ok: true };
  });
