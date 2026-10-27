import { createServerFn } from "@tanstack/react-start";

export type ItemMiniEstoque = {
  codigo: string;
  descricao: string;
  qtd: number;
  local: string;
};

type LinhaBruta = Record<string, unknown>;

const CAMPOS_CODIGO = ["codigo", "codigo_peca", "codigo_sap", "cod", "sku", "referencia", "ref"];
const CAMPOS_DESCRICAO = ["descricao", "nome", "peca", "material", "titulo", "item"];
const CAMPOS_QTD = ["qtd", "quantidade", "saldo", "estoque", "disponivel", "qtd_disponivel", "quantidade_disponivel"];
const CAMPOS_LOCAL = ["local", "localizacao", "locacao", "prateleira", "posicao", "endereco", "setor"];

function pegar(linha: LinhaBruta, candidatos: string[]): unknown {
  const chaves = Object.keys(linha);
  for (const c of candidatos) {
    const k = chaves.find((x) => x.toLowerCase() === c);
    if (k !== undefined && linha[k] !== null && linha[k] !== undefined) return linha[k];
  }
  return undefined;
}

function normalizar(linha: LinhaBruta): ItemMiniEstoque {
  const qtdBruta = pegar(linha, CAMPOS_QTD);
  const qtdNum = Number(qtdBruta);
  return {
    codigo: String(pegar(linha, CAMPOS_CODIGO) ?? "").trim().toUpperCase(),
    descricao: String(pegar(linha, CAMPOS_DESCRICAO) ?? "").trim().toUpperCase(),
    qtd: Number.isFinite(qtdNum) ? qtdNum : 0,
    local: String(pegar(linha, CAMPOS_LOCAL) ?? "").trim().toUpperCase(),
  };
}

const chaveBusca = (s: string) => s.replace(/[^A-Z0-9]/gi, "").toUpperCase();

let cache: { at: number; itens: ItemMiniEstoque[] } | null = null;

async function carregar(): Promise<ItemMiniEstoque[]> {
  const url = process.env["MINI_ESTOQUE_URL"];
  const key = process.env["MINI_ESTOQUE_ANON_KEY"];
  if (!url || !key) return [];

  const agora = Date.now();
  if (cache && agora - cache.at < 60_000) return cache.itens;

  const view = process.env["MINI_ESTOQUE_VIEW"] || "estoque_publico";
  const base = url.replace(/\/+$/, "");
  // Chaves novas (sb_publishable_/sb_secret_) são opacas: não podem ir como Bearer JWT.
  const headers: Record<string, string> = { apikey: key, Accept: "application/json" };
  if (!key.startsWith("sb_")) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(`${base}/rest/v1/${encodeURIComponent(view)}?select=*&limit=5000`, {
    headers,
  });

  const tipo = res.headers.get("content-type") ?? "";
  if (!res.ok || !tipo.includes("json")) {
    console.error(
      `[mini-estoque] leitura falhou [${res.status}] tipo="${tipo}": ${(await res.text()).slice(0, 300)}`,
    );
    return cache?.itens ?? [];
  }

  const linhas = (await res.json()) as LinhaBruta[];
  const itens = (Array.isArray(linhas) ? linhas : [])
    .map(normalizar)
    .filter((i) => i.codigo || i.descricao);
  cache = { at: agora, itens };
  return itens;
}

/** Busca livre no mini estoque da sala da supervisão (somente leitura). */
export const buscarMiniEstoque = createServerFn({ method: "POST" })
  .inputValidator((input: { termo: string }) => ({
    termo: String(input?.termo ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.termo.length < 2) return { configurado: false, itens: [] as ItemMiniEstoque[] };
    const url = process.env["MINI_ESTOQUE_URL"];
    const key = process.env["MINI_ESTOQUE_ANON_KEY"];
    if (!url || !key) return { configurado: false, itens: [] as ItemMiniEstoque[] };

    const itens = await carregar();
    const alvo = chaveBusca(data.termo);
    const termoUp = data.termo.toUpperCase();
    const achados = itens
      .filter((i) => chaveBusca(i.codigo).includes(alvo) || i.descricao.includes(termoUp))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 20);
    return { configurado: true, itens: achados };
  });

/** Verifica se um código específico existe no mini estoque (match por código). */
export const verificarMiniEstoque = createServerFn({ method: "POST" })
  .inputValidator((input: { codigo: string }) => ({
    codigo: String(input?.codigo ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.codigo.length < 3) return { configurado: false, itens: [] as ItemMiniEstoque[] };
    const url = process.env["MINI_ESTOQUE_URL"];
    const key = process.env["MINI_ESTOQUE_ANON_KEY"];
    if (!url || !key) return { configurado: false, itens: [] as ItemMiniEstoque[] };

    const itens = await carregar();
    const alvo = chaveBusca(data.codigo);
    const achados = itens.filter((i) => i.codigo && chaveBusca(i.codigo) === alvo).slice(0, 5);
    return { configurado: true, itens: achados };
  });
