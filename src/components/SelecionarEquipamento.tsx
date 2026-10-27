import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EquipamentoSelecionado = { id: string; nome: string };

export default function SelecionarEquipamento({ value, onChange, atual }: {
  value: EquipamentoSelecionado | null;
  onChange: (value: EquipamentoSelecionado | null) => void;
  atual?: string;
}) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const termo = busca.trim();
  const { data: equipamentos = [], isFetching, error } = useQuery({
    queryKey: ["equipamentos-edicao", termo],
    enabled: termo.length >= 2,
    queryFn: async () => {
      const like = `%${termo.replace(/[%,()]/g, " ")}%`;
      const { data, error } = await supabase.from("equipamentos")
        .select("id, prefixo_interno, codigo_armac, descricao")
        .eq("ativo", true)
        .or(`prefixo_interno.ilike.${like},codigo_armac.ilike.${like},descricao.ilike.${like}`)
        .order("prefixo_interno").limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  return <div className="space-y-2 rounded-md border border-primary p-3">
    <Label htmlFor={id}>Equipamento / Máquina</Label>
    {atual && <p className="text-xs text-muted-foreground">Atual: <b>{atual}</b></p>}
    {value ? <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold">{value.nome}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => { onChange(null); setBusca(""); }}>Desfazer</Button>
    </div> : <>
      <Input id={id} aria-label="Buscar equipamento para troca" value={busca}
        onChange={(e) => setBusca(e.target.value.toUpperCase())}
        placeholder="Buscar prefixo ou código Armac" />
      {termo.length >= 2 && <div className="max-h-40 overflow-y-auto" aria-label="Equipamentos encontrados">
        {isFetching && <p className="text-xs text-muted-foreground">Buscando…</p>}
        {error && <p role="alert" className="text-xs text-destructive">Não foi possível consultar as máquinas.</p>}
        {!isFetching && !error && !equipamentos.length && <p className="text-xs text-muted-foreground">Nenhuma máquina encontrada.</p>}
        {equipamentos.map((eq) => <Button key={eq.id} type="button" variant="ghost"
          className="h-auto w-full justify-start whitespace-normal py-2 text-left"
          onClick={() => { onChange({ id: eq.id, nome: [eq.prefixo_interno, eq.codigo_armac].filter(Boolean).join(" · ") }); setBusca(""); }}>
          <span><b>{eq.prefixo_interno}</b>{eq.codigo_armac ? ` · ${eq.codigo_armac}` : ""}
          {eq.descricao && <span className="block text-xs text-muted-foreground">{eq.descricao}</span>}</span>
        </Button>)}
      </div>}
    </>}
  </div>;
}
