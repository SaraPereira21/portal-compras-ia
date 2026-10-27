import { Badge } from "@/components/ui/badge";

type EqUso = { prefixo_interno?: string | null; codigo_armac?: string | null } | null | undefined;

/**
 * Selo de desvio: a peça foi solicitada por uma máquina mas será aplicada em outra.
 * Deve acompanhar a solicitação do início até a entrega.
 */
export default function DesvioBadge({
  solicitacao,
  className = "",
}: {
  solicitacao: unknown;
  className?: string;
}) {
  const s = solicitacao as { vai_para_outro?: boolean | null; equipamento_uso?: EqUso };
  if (!s?.vai_para_outro) return null;
  const eq = s.equipamento_uso;
  const destino = eq
    ? [eq.prefixo_interno, eq.codigo_armac].filter(Boolean).join(" · ")
    : "máquina não informada";
  return (
    <Badge
      className={`bg-amber-500 text-amber-950 hover:bg-amber-500 ${className}`}
      title="Peça desviada: será aplicada em outra máquina"
    >
      ➡️ DESVIO p/ {destino}
    </Badge>
  );
}
