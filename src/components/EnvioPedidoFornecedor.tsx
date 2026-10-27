import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enviarPedidoAoFornecedor } from "@/lib/envio-pedido.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type Fornecedor = {
  id: string;
  nome: string;
  emails_to: string[];
  emails_cc: string[];
  portal: boolean;
  portal_url: string | null;
  observacao: string | null;
  ativo: boolean;
};

function useFornecedores() {
  return useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Fornecedor[];
    },
  });
}

function useTemplate() {
  return useQuery({
    queryKey: ["email-template"],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracoes")
        .select("chave, valor")
        .in("chave", ["email_assunto_padrao", "email_corpo_padrao"]);
      const map = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]));
      return {
        assunto: map["email_assunto_padrao"] ?? "Pedido de Compra - {NUMERO_PEDIDO}_ {FORNECEDOR}",
        corpo: map["email_corpo_padrao"] ?? "",
      };
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    r.readAsDataURL(file);
  });
}

function textoParaHtmlEmail(texto: string) {
  const escapeHtml = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return texto
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((par) => `<p>${escapeHtml(par).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function htmlParaTexto(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.innerText || el.textContent || "").trim();
}

function limparHtmlEmail(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, style, meta, link").forEach((el) => el.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on") || attr.value.toLowerCase().includes("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML.trim();
}

function inserirHtmlNoCursor(html: string) {
  document.execCommand("insertHTML", false, html);
}

function RichEmailEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (nextHtml: string, nextText: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = html || "";
  }, [html]);

  const emitChange = () => {
    const nextHtml = limparHtmlEmail(editorRef.current?.innerHTML ?? "");
    onChange(nextHtml, htmlParaTexto(nextHtml));
  };

  const formatar = (cmd: "bold" | "italic" | "underline" | "insertUnorderedList") => {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    emitChange();
  };

  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          inserirHtmlNoCursor(
            `<p><img src="${String(reader.result)}" alt="Imagem colada" style="max-width:520px;width:100%;height:auto;display:block;margin:8px 0" /></p>`,
          );
          emitChange();
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    const pastedHtml = event.clipboardData.getData("text/html");
    const pastedText = event.clipboardData.getData("text/plain");
    if (pastedHtml) {
      inserirHtmlNoCursor(limparHtmlEmail(pastedHtml));
    } else if (pastedText) {
      inserirHtmlNoCursor(textoParaHtmlEmail(pastedText));
    }
    emitChange();
  };

  return (
    <div className="rounded-md border border-input bg-background shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 font-bold" onClick={() => formatar("bold")}>B</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 italic" onClick={() => formatar("italic")}>I</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 underline" onClick={() => formatar("underline")}>U</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => formatar("insertUnorderedList")}>• Lista</Button>
        <span className="ml-auto text-xs text-muted-foreground">cole imagem ou texto formatado aqui</span>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-label="Mensagem do e-mail"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onPaste={handlePaste}
        className="min-h-56 whitespace-normal p-3 text-sm leading-6 outline-none empty:before:text-muted-foreground empty:before:content-['Digite_ou_cole_a_mensagem...'] [&_img]:max-w-full [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}

// ---------------- Envio do pedido ao fornecedor ----------------
export function EnviarPedidoFornecedorButton({
  numeroPedido, pedidoCompraId, fornecedorSugerido, preset, label, autoOpen, onClose,
}: {
  numeroPedido: string | null;
  pedidoCompraId?: string | null;
  fornecedorSugerido?: string | null;
  preset?: { fornecedorId?: string | null; para?: string; cc?: string; assunto?: string; corpo?: string } | null;
  label?: string;
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [fornId, setFornId] = useState(preset?.fornecedorId ?? "");

  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [corpoHtml, setCorpoHtml] = useState("");
  const [para, setPara] = useState("");
  const [cc, setCc] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");

  const { data: fornecedores = [] } = useFornecedores();
  const { data: tpl } = useTemplate();
  const enviar = useServerFn(enviarPedidoAoFornecedor);
  const qcEnvios = useQueryClient();


  const ativos = useMemo(
    () => fornecedores.filter((f) => f.ativo && (!busca || f.nome.toLowerCase().includes(busca.toLowerCase()))),
    [fornecedores, busca],
  );
  const sel = fornecedores.find((f) => f.id === fornId) ?? null;

  useEffect(() => {
    if (!open || !tpl || preset) return;
    setAssunto(
      tpl.assunto
        .replace(/\{NUMERO_PEDIDO\}/g, numeroPedido ?? "")
        .replace(/\{FORNECEDOR\}/g, sel?.nome ?? fornecedorSugerido ?? ""),
    );
    const corpoPadrao = tpl.corpo.replace(/\{NUMERO_PEDIDO\}/g, numeroPedido ?? "");
    setCorpo((c) => c || corpoPadrao);
    setCorpoHtml((h) => h || textoParaHtmlEmail(corpoPadrao));
  }, [open, tpl, sel, numeroPedido, fornecedorSugerido, preset]);

  // Reenvio: carrega exatamente o que foi mandado antes
  useEffect(() => {
    if (!preset) return;
    setAssunto(preset.assunto ?? "");
    setCorpo(preset.corpo ?? "");
    setCorpoHtml(textoParaHtmlEmail(preset.corpo ?? ""));
    setPara(preset.para ?? "");
    setCc(preset.cc ?? "");
    if (preset.fornecedorId) setFornId(preset.fornecedorId);
  }, [preset]);

  useEffect(() => {
    if (!sel || preset) return;
    setPara(sel.emails_to.join("; "));
    setCc(sel.emails_cc.join("; "));
  }, [sel, preset]);

  // Pré-seleciona pelo fornecedor já gravado no pedido
  useEffect(() => {
    if (!open || fornId || !fornecedorSugerido) return;
    const m = fornecedores.find((f) => f.nome.toUpperCase() === fornecedorSugerido.toUpperCase());
    if (m) setFornId(m.id);
  }, [open, fornId, fornecedorSugerido, fornecedores]);


  const split = (v: string) => v.split(/[;,]/).map((x) => x.trim()).filter(Boolean);

  const submit = async () => {
    if (!sel) return toast.error("Escolha o fornecedor");
    if (sel.portal) return toast.error("Este fornecedor recebe por portal — envio manual.");
    if (!arquivos.length) return toast.error("Anexe ao menos o PDF do pedido");
    setEnviando(true);
    try {
      const anexos = await Promise.all(
        arquivos.map(async (f) => ({
          filename: f.name,
          mime_type: f.type || "application/octet-stream",
          data_base64: await fileToBase64(f),
        })),
      );
      await enviar({
        data: {
          pedido_compra_id: pedidoCompraId ?? null,
          numero_pedido_compra: numeroPedido ?? "",
          fornecedor_id: sel.id,
          assunto,
          corpo,
          corpo_html: corpoHtml || textoParaHtmlEmail(corpo),
          para: split(para),
          cc: split(cc),
          anexos,
        },
      });
      toast.success(`Pedido enviado para ${sel.nome}`);
      qcEnvios.invalidateQueries({ queryKey: ["envios-pedido"] });
      setOpen(false);
      onClose?.();
      setArquivos([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {!autoOpen && (
        <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10" onClick={() => setOpen(true)}>
          {label ?? "📧 Enviar ao fornecedor"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) onClose?.(); }}>

        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar pedido {numeroPedido ?? ""} ao fornecedor</DialogTitle>
            <DialogDescription className="sr-only">
              Escolha o fornecedor, confira os e-mails, a mensagem padrão e anexe os PDFs do pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input placeholder="Buscar fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              <div className="max-h-40 overflow-y-auto rounded border">
                {ativos.slice(0, 200).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFornId(f.id)}
                    className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-muted ${fornId === f.id ? "bg-muted font-semibold" : ""}`}
                  >
                    <span>{f.nome}</span>
                    {f.portal && <Badge variant="outline" className="text-[10px]">PORTAL</Badge>}
                  </button>
                ))}
                {ativos.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhum fornecedor encontrado.</p>}
              </div>
            </div>

            {sel?.portal && (
              <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                ⚠ {sel.nome} recebe pedidos por portal{sel.portal_url ? ` (${sel.portal_url})` : ""} — envio manual.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Para</Label>
                <Input value={para} onChange={(e) => setPara(e.target.value)} placeholder="email@fornecedor.com; outro@..." />
              </div>
              <div className="space-y-1">
                <Label>Cópia (CC)</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="suprimentos@..." />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Assunto</Label>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Mensagem</Label>
              <RichEmailEditor
                html={corpoHtml}
                onChange={(nextHtml, nextText) => {
                  setCorpoHtml(nextHtml);
                  setCorpo(nextText);
                }}
              />
            </div>

            <div className="space-y-1">
              <Label>Anexos (PDF do pedido, OS, etc.)</Label>
              <Input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
              {arquivos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {arquivos.map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join(" · ")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={enviando || !!sel?.portal}>
              {enviando ? "Enviando..." : "Enviar e-mail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- Admin: cadastro de fornecedores ----------------
export function AdminFornecedores() {
  const qc = useQueryClient();
  const { data: rows = [] } = useFornecedores();
  const { data: tpl } = useTemplate();
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [nome, setNome] = useState("");
  const [emails, setEmails] = useState("");
  const [colar, setColar] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTo, setEditTo] = useState("");
  const [editCc, setEditCc] = useState("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");

  useEffect(() => {
    if (tpl) { setAssunto(tpl.assunto); setCorpo(tpl.corpo); }
  }, [tpl]);

  const split = (v: string) => v.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fornecedores"] });
  const filtered = rows.filter((r) => r.nome.toLowerCase().includes(filtro.toLowerCase()));

  const adicionar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    const { error } = await supabase.from("fornecedores").insert({
      nome: nome.trim().toUpperCase(), emails_to: split(emails), emails_cc: [],
    });
    if (error) return toast.error(error.message);
    setNome(""); setEmails(""); refresh(); toast.success("Fornecedor cadastrado");
  };

  const importarLote = async () => {
    const linhas = colar.split("\n").map((l) => l.trim()).filter(Boolean);
    const registros = linhas
      .map((l) => {
        const partes = l.split(/\t|\s{2,}|;(?=\s*\S+@)/);
        const nm = (partes.shift() ?? "").trim().toUpperCase();
        const mails = split(partes.join(" ").replace(/\s+/g, " "));
        return nm && mails.length ? { nome: nm, emails_to: mails, emails_cc: [] } : null;
      })
      .filter(Boolean) as { nome: string; emails_to: string[]; emails_cc: string[] }[];
    if (!registros.length) return toast.error("Nada reconhecido. Use: NOME <tab> email1; email2");
    let ok = 0;
    for (const r of registros) {
      const { error } = await supabase.from("fornecedores").upsert(r, { onConflict: "nome" });
      if (!error) ok++;
    }
    setColar(""); refresh();
    toast.success(`${ok} fornecedor(es) importado(s)`);
  };

  const salvarTemplate = async () => {
    const { error } = await supabase.from("configuracoes").upsert([
      { chave: "email_assunto_padrao", valor: assunto },
      { chave: "email_corpo_padrao", valor: corpo },
    ], { onConflict: "chave" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["email-template"] });
    toast.success("Mensagem padrão salva");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Fornecedores ({rows.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar" : "Mostrar"}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input className="w-56" placeholder="Nome do fornecedor" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Input className="flex-1 min-w-56" placeholder="E-mails separados por ; " value={emails} onChange={(e) => setEmails(e.target.value)} />
            <Button onClick={adicionar}>Adicionar</Button>
          </div>

          <div className="space-y-2 rounded border p-3">
            <Label className="text-xs">Importar em lote (cole do Excel: NOME [tab] e-mails)</Label>
            <Textarea rows={4} value={colar} onChange={(e) => setColar(e.target.value)} placeholder={"NORMAQ\taliny.lima@normaq.com.br\nKM1\tvendas1@km1pecas.com.br; vendas@km1pecas.com.br"} />
            <Button size="sm" variant="outline" onClick={importarLote}>Importar lista</Button>
          </div>

          <div className="space-y-2 rounded border p-3">
            <Label className="text-xs">Mensagem padrão do pedido (use {"{NUMERO_PEDIDO}"} e {"{FORNECEDOR}"})</Label>
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto" />
            <Textarea rows={8} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
            <Button size="sm" onClick={salvarTemplate}>Salvar mensagem padrão</Button>
          </div>

          <Input placeholder="Buscar fornecedor..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {filtered.map((r) => (
              <div key={r.id} className="rounded border p-2 text-sm">
                {editId === r.id ? (
                  <div className="space-y-2">
                    <div className="font-semibold">{r.nome}</div>
                    <Input value={editTo} onChange={(e) => setEditTo(e.target.value)} placeholder="E-mails (Para)" />
                    <Input value={editCc} onChange={(e) => setEditCc(e.target.value)} placeholder="E-mails (Cópia)" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        const { error } = await supabase.from("fornecedores")
                          .update({ emails_to: split(editTo), emails_cc: split(editCc) }).eq("id", r.id);
                        if (error) return toast.error(error.message);
                        setEditId(null); refresh();
                      }}>Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{r.nome} {!r.ativo && <Badge variant="outline" className="text-[10px]">INATIVO</Badge>}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.emails_to.join("; ") || "sem e-mail"}{r.emails_cc.length ? ` · CC: ${r.emails_cc.join("; ")}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox checked={r.portal} onCheckedChange={async (v) => {
                          await supabase.from("fornecedores").update({ portal: !!v }).eq("id", r.id);
                          refresh();
                        }} /> Portal
                      </label>
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditId(r.id); setEditTo(r.emails_to.join("; ")); setEditCc(r.emails_cc.join("; "));
                      }}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.from("fornecedores").update({ ativo: !r.ativo }).eq("id", r.id);
                        refresh();
                      }}>{r.ativo ? "Inativar" : "Ativar"}</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------- Marcar como já enviado (fora do sistema) ----------------
export function MarcarComoEnviadoButton({
  numeroPedido, pedidoCompraId, fornecedorSugerido, solicitacaoIds = [],
}: {
  numeroPedido: string | null;
  pedidoCompraId?: string | null;
  fornecedorSugerido?: string | null;
  solicitacaoIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fornecedorNome, setFornecedorNome] = useState(fornecedorSugerido ?? "");
  const [obs, setObs] = useState("");
  const qc = useQueryClient();

  const salvar = async () => {
    setSalvando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("envios_pedido").insert({
        pedido_compra_id: pedidoCompraId ?? null,
        numero_pedido_compra: numeroPedido ?? "",
        fornecedor_nome: fornecedorNome.trim().toUpperCase() || null,
        para: [],
        cc: [],
        assunto: `Pedido ${numeroPedido ?? ""} enviado fora do sistema`,
        corpo: obs.trim() || "Registrado manualmente: pedido já havia sido enviado ao fornecedor antes do sistema.",
        anexos: [],
        status: "ENVIADO_FORA_DO_SISTEMA",
        enviado_por: auth.user?.id ?? null,
      } as never);
      if (error) throw new Error(error.message);

      // Sai da fila "Aprovados": marca as peças como pedido colocado.
      if (solicitacaoIds.length) {
        const { error: upErr } = await supabase
          .from("solicitacoes")
          .update({ status: "PEDIDO_COLOCADO" } as never)
          .in("id", solicitacaoIds);
        if (upErr) throw new Error(upErr.message);
      }

      toast.success("Pedido marcado como já enviado");
      qc.invalidateQueries({ queryKey: ["envios-pedido"] });
      qc.invalidateQueries({ queryKey: ["solicitacoes"] });
      setOpen(false);
      setObs("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        ✔ Já enviado
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar pedido {numeroPedido ?? ""} como já enviado</DialogTitle>
            <DialogDescription className="sr-only">
              Registra que este pedido foi enviado ao fornecedor fora do sistema, sem disparar e-mail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Nenhum e-mail será disparado. Serve apenas para sinalizar que o pedido já foi enviado ao fornecedor antes do sistema.
            </p>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div className="space-y-1">
              <Label>Observação (opcional)</Label>
              <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: enviado por e-mail em 20/07" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


// ---------------- Histórico de pedidos enviados (com reenvio) ----------------
type EnvioRow = {
  id: string;
  created_at: string;
  numero_pedido_compra: string | null;
  pedido_compra_id: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  para: string[];
  cc: string[];
  assunto: string | null;
  corpo: string | null;
  anexos: { nome?: string; tipo?: string; bytes?: number }[];
  status: string;
  erro: string | null;
};

function exportarCsvEnvios(rows: EnvioRow[]) {
  if (!rows.length) return;
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Data do envio", "Nº Pedido", "Fornecedor", "Para", "CC", "Assunto", "Anexos", "Status", "Erro"];
  const linhas = rows.map((r) => [
    new Date(r.created_at).toLocaleString("pt-BR"),
    r.numero_pedido_compra ?? "",
    r.fornecedor_nome ?? "",
    (r.para ?? []).join(", "),
    (r.cc ?? []).join(", "),
    r.assunto ?? "",
    (r.anexos ?? []).map((a) => a.nome ?? "").filter(Boolean).join(", "),
    r.status,
    r.erro ?? "",
  ]);
  const csv = "\uFEFF" + [header, ...linhas].map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comprador-enviados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function HistoricoEnviosPedidos() {
  const [filtro, setFiltro] = useState("");
  const [reenvio, setReenvio] = useState<EnvioRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["envios-pedido"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("envios_pedido")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EnvioRow[];
    },
  });

  const filtrados = rows.filter((r) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return [r.numero_pedido_compra, r.fornecedor_nome, r.assunto, (r.para ?? []).join(";")]
      .some((v) => (v ?? "").toString().toLowerCase().includes(q));
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Todos os e-mails de pedido já disparados. Se algo saiu errado, use <b>Reenviar</b> — o formulário abre com os mesmos dados (reanexe os arquivos).
        </p>
        <div className="flex items-center gap-2">
          <Input placeholder="Buscar por pedido, fornecedor, assunto..." className="max-w-xs" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <Button size="sm" variant="outline" disabled={filtrados.length === 0} onClick={() => exportarCsvEnvios(filtrados)}>
            ⬇ Relatório ({filtrados.length})
          </Button>
        </div>
      </div>


      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>}

      <div className="space-y-2">
        {filtrados.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">
                    📧 Pedido {r.numero_pedido_compra || "—"} · {r.fornecedor_nome ?? "Fornecedor"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")} · Para: {(r.para ?? []).join("; ") || "—"}
                    {r.cc?.length ? ` · CC: ${r.cc.join("; ")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "ERRO" ? "destructive" : r.status === "ENVIADO" ? "default" : "secondary"} className="text-[10px]">{r.status === "ENVIADO_FORA_DO_SISTEMA" ? "JÁ ENVIADO (FORA DO SISTEMA)" : r.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setReenvio(r)}>↻ Reenviar</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <p><b>Assunto:</b> {r.assunto ?? "—"}</p>
              <p><b>Anexos:</b> {(r.anexos ?? []).map((a) => a?.nome).filter(Boolean).join(" · ") || "—"}</p>
              {r.erro && <p className="text-destructive"><b>Erro:</b> {r.erro}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {reenvio && (
        <EnviarPedidoFornecedorButton
          autoOpen
          onClose={() => setReenvio(null)}
          numeroPedido={reenvio.numero_pedido_compra}
          pedidoCompraId={reenvio.pedido_compra_id}
          fornecedorSugerido={reenvio.fornecedor_nome}
          preset={{
            fornecedorId: reenvio.fornecedor_id,
            para: (reenvio.para ?? []).join("; "),
            cc: (reenvio.cc ?? []).join("; "),
            assunto: reenvio.assunto ?? "",
            corpo: reenvio.corpo ?? "",
          }}
        />
      )}
    </div>
  );
}
