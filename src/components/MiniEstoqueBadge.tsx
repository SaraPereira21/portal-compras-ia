import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { verificarMiniEstoque, type ItemMiniEstoque } from "@/lib/mini-estoque.functions";

/**
 * Aviso automático: mostra se a peça já existe no mini estoque da sala da supervisão.
 * Só aparece quando há saldo. Nunca bloqueia o fluxo.
 */
export default function MiniEstoqueBadge({
  codigo,
  compacto = false,
}: {
  codigo: string | null | undefined;
  compacto?: boolean;
}) {
  const cod = (codigo ?? "").trim();
  const verificar = useServerFn(verificarMiniEstoque);

  const { data } = useQuery({
    queryKey: ["mini-estoque", cod.toUpperCase()],
    enabled: cod.length >= 3,
    staleTime: 60_000,
    queryFn: () => verificar({ data: { codigo: cod } }),
  });

  const disponiveis: ItemMiniEstoque[] = (data?.itens ?? []).filter((i) => i.qtd > 0);
  if (disponiveis.length === 0) return null;

  const total = disponiveis.reduce((acc, i) => acc + i.qtd, 0);
  const locais = [...new Set(disponiveis.map((i) => i.local).filter(Boolean))].join(" / ");

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
        🧰 TEM NO MINI ESTOQUE · {total} un.{locais ? ` (${locais})` : ""}
      </span>
    );
  }

  return (
    <div className="mt-2 animate-pulse rounded-md border-2 border-emerald-500 bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">
      🧰 TEM NA SALA DA SUPERVISÃO — {total} un. disponível{total > 1 ? "is" : ""}
      {locais ? ` (${locais})` : ""}
      <div className="mt-0.5 text-xs font-normal text-emerald-800">
        Procure a supervisão antes de solicitar a compra.
      </div>
    </div>
  );
}
