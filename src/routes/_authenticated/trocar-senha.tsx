import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trocar-senha")({
  head: () => ({ meta: [{ title: "Trocar senha — Portal de Compras" }] }),
  component: TrocarSenhaPage,
});

const REGRAS = [
  { id: "len", texto: "Mínimo de 8 caracteres", ok: (s: string) => s.length >= 8 },
  { id: "upper", texto: "Pelo menos 1 letra MAIÚSCULA (A-Z)", ok: (s: string) => /[A-Z]/.test(s) },
  { id: "lower", texto: "Pelo menos 1 letra minúscula (a-z)", ok: (s: string) => /[a-z]/.test(s) },
  { id: "num", texto: "Pelo menos 1 número (0-9)", ok: (s: string) => /[0-9]/.test(s) },
  {
    id: "esp",
    texto: "Pelo menos 1 caractere especial (!@#$%&*...)",
    ok: (s: string) => /[^A-Za-z0-9]/.test(s),
  },
  { id: "sp", texto: "Sem espaços em branco", ok: (s: string) => s.length > 0 && !/\s/.test(s) },
];

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const status = REGRAS.map((r) => ({ ...r, atende: r.ok(s1) }));
  const todasOk = status.every((r) => r.atende);
  const iguais = s1.length > 0 && s1 === s2;

  async function salvar() {
    setErro(null);
    if (!todasOk) return setErro("A senha ainda não atende a todos os requisitos abaixo.");
    if (!iguais) return setErro("As senhas não conferem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: s1 });
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", u.user.id);
        if (pErr) {
          console.error("[trocar-senha] perfil:", pErr.message);
          setErro(`Senha alterada, mas não foi possível liberar o acesso: ${pErr.message}`);
          setLoading(false);
          return;
        }
      }
      toast.success("Senha atualizada");
      navigate({ to: "/painel" });
    } catch (err) {
      const msg = (err as Error).message || "Não foi possível salvar a senha";
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Defina sua nova senha</CardTitle>
          <CardDescription>Primeiro acesso — crie uma senha pessoal para continuar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nova senha</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={s1}
              onChange={(e) => setS1(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={s2}
              onChange={(e) => setS2(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) void salvar();
              }}
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="mb-2 font-medium">A senha precisa ter:</p>
            <ul className="space-y-1">
              {status.map((r) => (
                <li
                  key={r.id}
                  className={r.atende ? "text-primary" : "text-muted-foreground"}
                >
                  <span aria-hidden className="mr-2">
                    {r.atende ? "✔" : "•"}
                  </span>
                  {r.texto}
                </li>
              ))}
              <li className={iguais ? "text-primary" : "text-muted-foreground"}>
                <span aria-hidden className="mr-2">
                  {iguais ? "✔" : "•"}
                </span>
                As duas senhas devem ser iguais
              </li>
            </ul>
          </div>

          {erro && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {erro}
            </p>
          )}

          <Button className="w-full" disabled={loading} onClick={salvar}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
