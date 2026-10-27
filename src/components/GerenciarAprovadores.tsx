import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APROVADORES, DIRETOR, type Aprovador } from "@/lib/aprovadores";

export type AprovadorRow = Aprovador & { id?: string };

/** Lista de aprovadores vinda do banco (cai na lista fixa se ainda não houver registros). */
export function useAprovadores() {
  const q = useQuery({
    queryKey: ["aprovadores"],
    queryFn: async (): Promise<AprovadorRow[]> => {
      const { data, error } = await supabase
        .from("aprovadores")
        .select("id, bu, coordenador, gerente, diretor")
        .eq("ativo", true)
        .order("coordenador");
      if (error) throw error;
      return (data ?? []) as AprovadorRow[];
    },
  });
  const lista = q.data && q.data.length ? q.data : (APROVADORES as AprovadorRow[]);
  return { lista, isLoading: q.isLoading };
}

export function acharAprovador(lista: AprovadorRow[], coordenador: string | null | undefined): AprovadorRow | null {
  if (!coordenador) return null;
  const alvo = coordenador.trim().toUpperCase();
  return lista.find((a) => a.coordenador.trim().toUpperCase() === alvo) ?? null;
}

/** Lápis que abre a janela de cadastro/edição de aprovadores. */
export function EditarAprovadoresBotao() {
  const [open, setOpen] = useState(false);
  const { lista } = useAprovadores();
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ coordenador: "", gerente: "", diretor: DIRETOR });
  const [salvando, setSalvando] = useState(false);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["aprovadores"] });

  const adicionar = async () => {
    const coordenador = novo.coordenador.trim().toUpperCase();
    const gerente = novo.gerente.trim().toUpperCase();
    const diretor = novo.diretor.trim().toUpperCase() || DIRETOR;
    if (!coordenador || !gerente) return toast.error("Informe o coordenador e o gerente");
    setSalvando(true);
    const { error } = await supabase.from("aprovadores").insert({ bu: "", coordenador, gerente, diretor, ativo: true });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Aprovador adicionado");
    setNovo({ coordenador: "", gerente: "", diretor: DIRETOR });
    await recarregar();
  };

  const salvarLinha = async (a: AprovadorRow, campos: Partial<Aprovador>) => {
    if (!a.id) return toast.error("Aprovador da lista padrão — adicione-o abaixo para poder editar");
    const { error } = await supabase.from("aprovadores").update(campos).eq("id", a.id);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    await recarregar();
  };

  const remover = async (a: AprovadorRow) => {
    if (!a.id) return toast.error("Aprovador da lista padrão — não pode ser removido");
    if (!window.confirm(`Remover ${a.coordenador} da lista de aprovadores?`)) return;
    const { error } = await supabase.from("aprovadores").update({ ativo: false }).eq("id", a.id);
    if (error) return toast.error("Não foi possível remover: " + error.message);
    toast.success("Aprovador removido");
    await recarregar();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        title="Adicionar ou editar aprovadores"
        onClick={() => setOpen(true)}
      >
        ✏️ Aprovadores
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Aprovadores</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {lista.map((a, i) => (
              <div key={a.id ?? `fixo-${i}`} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <Label className="text-[10px]">Coordenador</Label>
                  <Input
                    defaultValue={a.coordenador}
                    className="uppercase"
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v && v !== a.coordenador) void salvarLinha(a, { coordenador: v });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Gerente</Label>
                  <Input
                    defaultValue={a.gerente}
                    className="uppercase"
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v && v !== a.gerente) void salvarLinha(a, { gerente: v });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Diretor</Label>
                  <Input
                    defaultValue={a.diretor}
                    className="uppercase"
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v && v !== a.diretor) void salvarLinha(a, { diretor: v });
                    }}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void remover(a)}>
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-dashed p-2">
            <p className="mb-2 text-xs font-medium">Adicionar novo aprovador</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[10px]">Coordenador</Label>
                <Input value={novo.coordenador} className="uppercase" onChange={(e) => setNovo((n) => ({ ...n, coordenador: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label className="text-[10px]">Gerente</Label>
                <Input value={novo.gerente} className="uppercase" onChange={(e) => setNovo((n) => ({ ...n, gerente: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <Label className="text-[10px]">Diretor</Label>
                <Input value={novo.diretor} className="uppercase" onChange={(e) => setNovo((n) => ({ ...n, diretor: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <Button type="button" size="sm" className="mt-2" disabled={salvando} onClick={() => void adicionar()}>
              + Adicionar
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
