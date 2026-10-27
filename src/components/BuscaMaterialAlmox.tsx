import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buscarMateriaisAlmox,
  buscarMateriaisSemGiro,
  darBaixaSemGiro,
  type MaterialAlmox as Material,
  type MaterialSemGiro,
} from "@/lib/materiais.functions";
import { buscarMiniEstoque } from "@/lib/mini-estoque.functions";


function BaixaLoteDialog({ material, termo }: { material: MaterialSemGiro; termo: string }) {
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState("1");
  const [solicitante, setSolicitante] = useState("");
  const [os, setOs] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const baixar = useServerFn(darBaixaSemGiro);

  const confirmar = async () => {
    const q = Number(String(qtd).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Informe a quantidade.");
    if (q > material.qtd) return toast.error(`Saldo do lote: ${material.qtd} un.`);
    setSalvando(true);
    try {
      const r = await baixar({
        data: { material_id: material.id, quantidade: q, solicitante, os_numero: os, observacao: obs },
      });
      toast.success(`Baixa registrada · saldo restante ${r.saldo} un.`);
      qc.invalidateQueries({ queryKey: ["materiais-sem-giro", termo] });
      setAberto(false);
      setQtd("1");
      setSolicitante("");
      setOs("");
      setObs("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        📦 Dar baixa
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dar baixa no lote</DialogTitle>
            <DialogDescription>
              {material.descricao} · Ref. {material.referencia}
              {material.lote ? ` · lote ${material.lote}` : ""} — saldo atual {material.qtd} un.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantidade retirada</Label>
              <Input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <Label className="text-xs">OS (opcional)</Label>
              <Input value={os} onChange={(e) => setOs(e.target.value.toUpperCase())} className="uppercase" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Quem vai retirar</Label>
              <Input
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value.toUpperCase())}
                className="uppercase"
                placeholder="NOME DO MECÂNICO"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observação (opcional)</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value.toUpperCase())} className="uppercase" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando}>{salvando ? "Salvando…" : "Confirmar baixa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function BuscaMaterialAlmox({
  onSelecionar,
  label = "🔎 Verificar se já tem cadastro / estoque",
  termoInicial = "",
  variant = "outline",
  className = "w-full sm:w-auto",
  permitirBaixa = false,
}: {
  onSelecionar?: (m: { codigo: string; descricao: string }) => void;
  label?: string;
  termoInicial?: string;
  variant?: "outline" | "secondary" | "ghost" | "default";
  className?: string;
  permitirBaixa?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState(termoInicial.toUpperCase());
  const q = termo.trim();
  const buscar = useServerFn(buscarMateriaisAlmox);


  const buscarMini = useServerFn(buscarMiniEstoque);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ["materiais-almox", q],
    enabled: aberto && q.length >= 2,
    queryFn: () => buscar({ data: { termo: q } }) as Promise<Material[]>,
  });

  const { data: mini } = useQuery({
    queryKey: ["mini-estoque-busca", q],
    enabled: aberto && q.length >= 2,
    staleTime: 60_000,
    queryFn: () => buscarMini({ data: { termo: q } }),
  });
  const miniItens = mini?.itens ?? [];

  const buscarSemGiro = useServerFn(buscarMateriaisSemGiro);
  const { data: semGiro = [] } = useQuery({
    queryKey: ["materiais-sem-giro", q],
    enabled: aberto && q.length >= 2,
    staleTime: 60_000,
    queryFn: () => buscarSemGiro({ data: { termo: q } }) as Promise<MaterialSemGiro[]>,
  });
  const semGiroComSaldo = semGiro.filter((m) => m.qtd > 0);




  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={() => {
          if (termoInicial.trim()) setTermo(termoInicial.trim().toUpperCase());
          setAberto(true);
        }}
        className={className}
      >
        <Search className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Consulta de material no almoxarifado</DialogTitle>
            <DialogDescription>
              Busque por código SAP, descrição ou referência do fabricante. Se não encontrar, sem problema: continue
              digitando a descrição e o código normalmente.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value.toUpperCase())}
            placeholder="Ex.: DISCO DESBASTE, 200070351, 43896"
            className="uppercase"
          />

          {miniItens.length > 0 && (
            <div className="rounded-md border-2 border-emerald-500 bg-emerald-50 p-2">
              <div className="text-sm font-bold text-emerald-900">🧰 Sala da Supervisão (mini estoque)</div>
              <div className="mt-2 space-y-2">
                {miniItens.map((m, i) => (
                  <div key={`${m.codigo}-${i}`} className="rounded-md border border-emerald-300 bg-white p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.codigo && <span className="font-mono text-sm font-semibold">{m.codigo}</span>}
                      {m.qtd > 0 ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          ✅ {m.qtd} un. disponível{m.local ? ` · ${m.local}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Sem saldo</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm">{m.descricao}</div>
                    {onSelecionar && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => {
                          onSelecionar({ codigo: m.codigo, descricao: m.descricao });
                          setAberto(false);
                        }}
                      >
                        Usar este material
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs font-medium text-emerald-900">
                TEM NA SALA DA SUPERVISÃO — procure a supervisão antes de solicitar compra.
              </p>
            </div>
          )}

          {semGiroComSaldo.length > 0 && (
            <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-2">
              <div className="text-sm font-bold text-amber-900">📦 Lotes de material sem giro</div>
              <div className="mt-2 space-y-2">
                {semGiroComSaldo.map((m) => (
                  <div key={m.referencia} className="rounded-md border border-amber-300 bg-white p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-600 hover:bg-amber-600">SAÍDA MANUAL</Badge>
                      <Badge variant="secondary">
                        {m.qtd} un.{m.lote ? ` · ${m.lote}` : ""}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm">{m.descricao}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">Ref.: {m.referencia}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onSelecionar && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            onSelecionar({ codigo: m.referencia, descricao: (m.descricao ?? "").toUpperCase() });
                            setAberto(false);
                          }}
                        >
                          Usar este material
                        </Button>
                      )}
                      {permitirBaixa && <BaixaLoteDialog material={m} termo={q} />}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs font-medium text-amber-900">
                Está fora do estoque do SAP — a retirada é feita por SAÍDA MANUAL com a supervisão.
              </p>
            </div>
          )}


          <div className="text-xs font-semibold text-muted-foreground">Estoque SAP (almoxarifado)</div>

          {q.length < 2 ? (
            <p className="text-xs text-muted-foreground">Digite ao menos 2 caracteres.</p>
          ) : isFetching ? (
            <p className="text-xs text-muted-foreground">Buscando…</p>
          ) : resultados.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <b>Sem cadastro encontrado.</b>
              <p className="mt-1 text-xs text-muted-foreground">
                Tudo bem — preencha a descrição e o código original mesmo assim. O PCM cuida do cadastro.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {resultados.map((m) => (
                <div key={m.codigo_sap} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{m.codigo_sap}</span>
                    {m.qtd > 0 ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        ✅ {m.qtd} em estoque{m.locacao ? ` · ${m.locacao}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Cadastrado · sem estoque</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm">{m.descricao}</div>
                  {(m.referencia_fabrica || m.descricao_antiga) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m.referencia_fabrica ? `Ref. fábrica: ${m.referencia_fabrica}` : ""}
                      {m.descricao_antiga ? ` · ${m.descricao_antiga}` : ""}
                    </div>
                  )}
                  {onSelecionar && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => {
                        onSelecionar({ codigo: m.codigo_sap, descricao: (m.descricao ?? "").toUpperCase() });
                        setAberto(false);
                      }}
                    >
                      Usar este material
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
