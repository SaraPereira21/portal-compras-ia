import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { importarEstoqueAlmox, type LinhaEstoque } from "@/lib/estoque.functions";

const ALIAS: Record<keyof LinhaEstoque, string[]> = {
  codigo_sap: ["MATERIAL SAP", "CODIGO SAP", "CÓDIGO SAP", "MATERIAL", "CODIGO", "CÓDIGO", "COD SAP"],
  descricao: ["DESCRICAO DE MATERIAL SAP", "DESCRIÇÃO DE MATERIAL SAP", "DESCRICAO", "DESCRIÇÃO", "TEXTO BREVE"],
  locacao: ["LOCACAO", "LOCAÇÃO", "LOCAL", "ENDERECO", "ENDEREÇO"],
  qtd: [
    "QTD",
    "QUANTIDADE",
    "SALDO",
    "ESTOQUE",
    "ESTOQUE DE UTILIZACAO LIVRE",
    "ESTOQUE DE UTILIZAÇÃO LIVRE",
  ],
  desenho_engeman: ["DESENHO ENGEMAN", "DESENHO"],
  referencia_fabrica: ["REFERENCIA FABRICA", "REFERÊNCIA FABRICA", "REFERÊNCIA FÁBRICA", "REF FABRICA", "REFERENCIA"],
  descricao_antiga: ["DESCRICAO ANTIGA", "DESCRIÇÃO ANTIGA"],
  novo_cod: ["NOVO COD", "NOVO CÓD", "NOVO CODIGO", "NOVO CÓDIGO"],
};

function norm(s: unknown) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

type Deteccao = { linhas: LinhaEstoque[]; colunas: Partial<Record<keyof LinhaEstoque, string>>; headerRow: number };

const CAMPOS = Object.keys(ALIAS) as (keyof LinhaEstoque)[];

function achaColuna(campo: keyof LinhaEstoque, header: string[]): number {
  const alvos = ALIAS[campo].map(norm);
  const nh = header.map(norm);
  let i = nh.findIndex((c) => c && alvos.includes(c));
  if (i >= 0) return i;
  // fallback: coluna que contém algum alias (ex.: "MATERIAL SAP (COD)")
  i = nh.findIndex((c) => c && alvos.some((a) => c.includes(a)));
  return i;
}

function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mapear(matriz: unknown[][]): Deteccao {
  // localiza a linha de cabeçalho (pode haver títulos/logos acima)
  let headerRow = -1;
  let melhor = 0;
  const limite = Math.min(matriz.length, 30);
  for (let r = 0; r < limite; r++) {
    const header = (matriz[r] ?? []).map((c) => String(c ?? ""));
    const achados = CAMPOS.filter((c) => achaColuna(c, header) >= 0).length;
    const temCodigo = achaColuna("codigo_sap", header) >= 0;
    if (temCodigo && achados > melhor) { melhor = achados; headerRow = r; }
  }
  if (headerRow < 0) {
    throw new Error(
      "Não encontrei a linha de cabeçalho com o código SAP. Verifique se a planilha tem uma coluna como 'Material SAP'.",
    );
  }

  const header = (matriz[headerRow] ?? []).map((c) => String(c ?? ""));
  const idx = {} as Record<keyof LinhaEstoque, number>;
  const colunas: Partial<Record<keyof LinhaEstoque, string>> = {};
  for (const c of CAMPOS) {
    idx[c] = achaColuna(c, header);
    if (idx[c] >= 0) colunas[c] = header[idx[c]];
  }

  const txt = (row: unknown[], i: number) => {
    if (i < 0) return null;
    const v = row[i];
    if (v === undefined || v === null || String(v).trim() === "") return null;
    return String(v).trim();
  };

  const linhas: LinhaEstoque[] = [];
  for (let r = headerRow + 1; r < matriz.length; r++) {
    const row = matriz[r] ?? [];
    const codigo = txt(row, idx.codigo_sap);
    if (!codigo) continue;
    linhas.push({
      codigo_sap: codigo,
      descricao: txt(row, idx.descricao),
      locacao: txt(row, idx.locacao),
      qtd: idx.qtd >= 0 ? numero(row[idx.qtd]) : 0,
      desenho_engeman: txt(row, idx.desenho_engeman),
      referencia_fabrica: txt(row, idx.referencia_fabrica),
      descricao_antiga: txt(row, idx.descricao_antiga),
      novo_cod: txt(row, idx.novo_cod),
    });
  }
  return { linhas, colunas, headerRow };
}

export default function ImportarEstoqueAlmox() {
  const qc = useQueryClient();
  const importar = useServerFn(importarEstoqueAlmox);
  const [arquivo, setArquivo] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaEstoque[]>([]);
  const [colunas, setColunas] = useState<Partial<Record<keyof LinhaEstoque, string>>>({});
  const [erro, setErro] = useState<string>("");
  const [substituir, setSubstituir] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState<{ gravadas: number; removidas: number; comSaldo: number } | null>(null);

  async function lerArquivo(file: File) {
    setErro(""); setResultado(null); setLinhas([]); setColunas({}); setArquivo(file.name); setLendo(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
      const det = mapear(matriz);
      if (det.linhas.length === 0) throw new Error("Nenhuma linha com código SAP encontrada.");
      setLinhas(det.linhas);
      setColunas(det.colunas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo");
    } finally {
      setLendo(false);
    }
  }



  async function enviar() {
    setEnviando(true);
    try {
      const r = (await importar({ data: { linhas, substituirTudo: substituir } })) as {
        gravadas: number; removidas: number; comSaldo: number;
      };
      setResultado(r);
      setLinhas([]);
      qc.invalidateQueries({ queryKey: ["materiais-almox"] });
      toast.success(`Estoque atualizado: ${r.gravadas} materiais`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5" /> Importar estoque do almoxarifado (SAP)
        </CardTitle>
        <CardDescription>
          Suba a planilha diária (.xlsx ou .csv). O sistema reconhece as colunas Material SAP, Descrição, Locação, QTD,
          Desenho Engeman, Referência Fábrica, Descrição Antiga e Novo Cód.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-2 file:text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lerArquivo(f);
          }}
        />

        {lendo && <p className="text-sm text-muted-foreground">Lendo planilha…</p>}

        {erro && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{erro}</span>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm">
              <b>{arquivo}</b> · {linhas.length} materiais lidos ·{" "}
              {linhas.filter((l) => l.qtd > 0).length} com saldo
            </p>
            <p className="text-xs text-muted-foreground">
              Colunas reconhecidas:{" "}
              {CAMPOS.filter((c) => colunas[c]).map((c) => `${c} → "${colunas[c]}"`).join(" · ") || "nenhuma"}
            </p>
            {(!colunas.qtd || !colunas.descricao) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Não reconheci {[!colunas.descricao && "a descrição", !colunas.qtd && "a quantidade"].filter(Boolean).join(" nem ")}
                  . Renomeie o cabeçalho da planilha (ex.: "Descrição de Material SAP" e "QTD") e envie de novo.
                </span>
              </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-1 text-left">Código</th>
                    <th className="p-1 text-left">Descrição</th>
                    <th className="p-1 text-left">Locação</th>
                    <th className="p-1 text-right">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 20).map((l) => (
                    <tr key={l.codigo_sap} className="border-t">
                      <td className="p-1 font-mono">{l.codigo_sap}</td>
                      <td className="p-1">{l.descricao}</td>
                      <td className="p-1">{l.locacao}</td>
                      <td className="p-1 text-right">{l.qtd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(v === true)} className="mt-0.5" />
              <span>
                Substituir a base inteira (apaga materiais que não estão na planilha).
                <span className="block text-xs text-muted-foreground">
                  Desmarque para apenas atualizar/adicionar os itens do arquivo.
                </span>
              </span>
            </label>
            <Button onClick={() => void enviar()} disabled={enviando} className="w-full sm:w-auto">
              <Upload className="mr-2 h-4 w-4" />
              {enviando ? "Importando…" : `Importar ${linhas.length} materiais`}
            </Button>
          </div>
        )}

        {resultado && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-600/50 bg-emerald-50 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              {resultado.gravadas} materiais gravados ({resultado.comSaldo} com saldo)
              {resultado.removidas > 0 ? ` · ${resultado.removidas} removidos por não constarem na planilha` : ""}.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
