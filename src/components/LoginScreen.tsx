// Tela de entrada — mesmo desenho do kf-garantia/kf-dashboard (arte de fundo,
// cartão branco, logo, "KF Baterias"), com as três etapas do login KF:
//   1. usuário + senha (+ anti-robô Turnstile, quando configurado)
//   2. primeiro acesso de quem usa 2FA: QR code para o app autenticador
//   3. código de 6 dígitos
// Quem não usa 2FA (o operador) entra direto na etapa 1.
import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { entrar, confirmar2fa } from "@/lib/sessao.functions";
import { useAuth } from "@/lib/auth";

// Sitekey PRÓPRIO deste sistema (widget "KF Marmita Login" na conta
// Cloudflare). Sem ele, o widget não aparece — e o servidor só exige o
// anti-robô quando TURNSTILE_SECRET está configurado no Worker.
const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type Etapa = "login" | "setup" | "codigo";

function useTurnstile() {
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    if (!SITEKEY) return;
    let cancelado = false;
    const montar = () => {
      if (cancelado || !caixa.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(caixa.current, {
        sitekey: SITEKEY,
        action: "login",
        theme: "light",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (window.turnstile) montar();
    else if (!document.querySelector("script[data-kf-turnstile]")) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.dataset.kfTurnstile = "1";
      s.onload = montar;
      document.head.appendChild(s);
    } else {
      const t = window.setInterval(() => window.turnstile && (window.clearInterval(t), montar()), 100);
    }
    return () => {
      cancelado = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  // O token é de uso único: depois de cada tentativa, pede outro.
  const renovar = () => {
    setToken("");
    if (widget.current) window.turnstile?.reset(widget.current);
  };

  return { caixa, token, ativo: !!SITEKEY, pronto: !SITEKEY || !!token, renovar };
}

export function LoginScreen() {
  const { entrou } = useAuth();
  const [etapa, setEtapa] = useState<Etapa>("login");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [qr, setQr] = useState<{ img: string; secret: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ts = useTurnstile();

  const voltar = () => {
    setEtapa("login");
    setCodigo("");
    setErro(null);
    setQr(null);
  };

  const tentarEntrar = async (codigoTotp?: string) => {
    setEnviando(true);
    setErro(null);
    try {
      const r = await entrar({
        data: {
          usuario: usuario.trim(),
          senha,
          ...(codigoTotp ? { codigo: codigoTotp } : {}),
          ...(ts.token ? { turnstile: ts.token } : {}),
        },
      });
      if ("ok" in r) {
        entrou(r.usuario);
        return;
      }
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setInfo(null);
      if ("precisaConfigurar2fa" in r) {
        const q = qrcode(0, "M");
        q.addData(r.qrCodeUrl);
        q.make();
        setQr({ img: q.createDataURL(5, 2), secret: r.secret });
        setEtapa("setup");
      } else {
        setEtapa("codigo");
      }
      setCodigo("");
    } catch {
      setErro("Não foi possível entrar agora. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
      ts.renovar();
    }
  };

  const confirmarSetup = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const r = await confirmar2fa({ data: { usuario: usuario.trim(), codigo } });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setQr(null);
      setCodigo("");
      setSenha("");
      setEtapa("login");
      setInfo("Verificação em duas etapas ativada. Entre de novo com sua senha e o código do app.");
    } catch {
      setErro("Não foi possível confirmar agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const codigoValido = /^\d{6}$/.test(codigo);

  return (
    <div className="entrada">
      <main className="cartao-entrada">
        <div className="logo-bloco">
          <img src="/logo.jpg" width={76} height={76} alt="" />
          <h1>KF Baterias</h1>
          <p>Controle de marmitas</p>
        </div>

        {erro && (
          <p className="err" role="alert" aria-live="assertive">
            {erro}
          </p>
        )}
        {info && !erro && <p className="info">{info}</p>}

        {etapa === "login" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tentarEntrar();
            }}
          >
            <label htmlFor="usuario">Usuário</label>
            <input
              id="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <button type="submit" className="btn-entrar" disabled={enviando || !usuario.trim() || !senha || !ts.pronto}>
              {enviando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}

        {etapa === "setup" && qr && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmarSetup();
            }}
          >
            <p className="info">
              Primeiro acesso: configure a verificação em duas etapas escaneando o QR code com o Google Authenticator
              ou o Authy.
            </p>
            <div className="qr-box">
              <img src={qr.img} width={200} height={200} alt="QR code para configurar a verificação em duas etapas" />
            </div>
            <p className="secret-box">{qr.secret}</p>
            <label htmlFor="codigo-setup">Código de 6 dígitos do app</label>
            <input
              id="codigo-setup"
              className="campo-codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className="btn-entrar" disabled={enviando || !codigoValido}>
              Confirmar e ativar
            </button>
            <button type="button" className="voltar" onClick={voltar}>
              Voltar
            </button>
          </form>
        )}

        {etapa === "codigo" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tentarEntrar(codigo);
            }}
          >
            <p className="info">Digite o código de 6 dígitos do seu app autenticador.</p>
            <label htmlFor="codigo-login">Código de verificação</label>
            <input
              id="codigo-login"
              className="campo-codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className="btn-entrar" disabled={enviando || !codigoValido || !ts.pronto}>
              {enviando ? "Verificando..." : "Verificar"}
            </button>
            <button type="button" className="voltar" onClick={voltar}>
              Voltar
            </button>
          </form>
        )}

        {/* O anti-robô vale para as duas chamadas de login (senha e código),
            por isso fica fora dos formulários e não some entre as etapas. */}
        {ts.ativo && (
          <div className="turnstile-wrap" hidden={etapa === "setup"}>
            <div ref={ts.caixa} />
          </div>
        )}

        <p className="rodape-entrada">Uso interno · KF Baterias</p>
      </main>
    </div>
  );
}
