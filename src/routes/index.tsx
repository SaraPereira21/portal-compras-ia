import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, ShieldCheck, Wrench } from "lucide-react";
import { DashboardPublico } from "@/components/DashboardPublico";
import PainelGestorTab from "@/components/PainelGestorTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portal de Compras — Manutenção" },
      { name: "description", content: "Portal para solicitar peças, acompanhar pedidos e controlar compras da manutenção." },
      { property: "og:title", content: "Portal de Compras — Manutenção" },
      { property: "og:description", content: "Solicitações, aprovações e acompanhamento de compras de peças da oficina." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl">Portal de Compras</span>

            <div className="hidden sm:block border-l pl-3">
              <h1 className="text-base font-bold leading-tight tracking-tight">Portal de Compras</h1>
              <p className="text-[11px] text-muted-foreground">Manutenção • Oficina</p>
            </div>
          </div>
          <Link to="/auth" className="text-sm text-primary hover:underline">Login gestores</Link>
        </div>
      </header>

      {/* Hero com banner */}
      <section className="relative overflow-hidden border-b">
        <div className="h-40 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">Portal de Compras com IA</div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24 text-white">
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Requisitar uma peça</h2>
          <p className="mt-3 max-w-2xl text-sm text-white/80 sm:text-base">
            Fim do papel. Cadastre sua solicitação, acompanhe status e receba a peça sem intermediários.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-12">


        <div className="grid gap-6 md:grid-cols-2">
          <Link to="/solicitante" className="block">
            <Card className="h-full cursor-pointer border-2 transition-all hover:border-primary hover:shadow-lg">
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Wrench className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Sou Solicitante</CardTitle>
                <CardDescription>
                  Mantenedor / mecânico. Selecione seu nome para abrir e acompanhar suas RCs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Entrar como solicitante →</span>
              </CardContent>
            </Card>
          </Link>

          <Link to="/auth" className="block">
            <Card className="h-full cursor-pointer border-2 transition-all hover:border-primary hover:shadow-lg">
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Sou Supervisor / PCM / Comprador / Admin</CardTitle>
                <CardDescription>
                  Acesso ao painel de aprovação, tratativa e rastreio de pedidos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Fazer login →</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-10">
          <PainelGestorTab />
        </div>

        <div className="mt-12">
          <div className="mb-4">
            <h3 className="text-2xl font-bold tracking-tight">Painel de acompanhamento</h3>
            <p className="text-sm text-muted-foreground">Visão pública — lead times, pipeline e rastreio de pedidos por máquina.</p>
          </div>
          <DashboardPublico />
        </div>



        <div className="mt-16 rounded-lg border bg-card p-6">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Como funciona o fluxo</h3>
          </div>
          <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-5">
            <li><b className="text-foreground">1.</b> Solicitante abre a RC</li>
            <li><b className="text-foreground">2.</b> Supervisor aprova</li>
            <li><b className="text-foreground">3.</b> PCM trata e cota</li>
            <li><b className="text-foreground">4.</b> Comprador coloca pedido</li>
            <li><b className="text-foreground">5.</b> Solicitante confirma recebimento</li>
          </ol>
        </div>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground">
          Portal interno de manutenção
        </div>
      </footer>
    </div>
  );
}
