import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { PermissionsProvider } from "@/lib/permissions";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

// Aplica o tema ANTES da primeira pintura (sem isso a tela pisca clara e
// depois escurece). Mesma regra dos outros sistemas KF: `kfTema` salvo, ou o
// tema do sistema operacional quando não há preferência.
const TEMA_INICIAL = `try{var t=localStorage.getItem("kfTema");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#8E171A" },
      { title: "KF Marmita — controle de marmitas" },
      { name: "description", content: "KF Baterias — controle de retirada de marmitas dos funcionários" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Inter servida pelo próprio domínio (public/fonte/inter.woff2, o mesmo
      // arquivo do kf-dashboard, hash 3100e775) — o @font-face está no
      // kf-tokens.css. Nada de Google Fonts: a tela não depende de serviço externo.
      { rel: "preload", href: "/fonte/inter.woff2?v=3100e775", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: () => (
    <AuthProvider>
      <PermissionsProvider>
        <Outlet />
        <Toaster richColors position="top-center" />
      </PermissionsProvider>
    </AuthProvider>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
