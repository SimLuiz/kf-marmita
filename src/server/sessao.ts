// ============================================================================
// AUTENTICAÇÃO — usuário/senha + 2FA (TOTP) + sessão por cookie
// ============================================================================
// 🔴 Mesmo desenho de kf-garantia/worker/src/auth.js (que veio do
// kf-dashboard): bcrypt no banco, hash SHA-256 do token de sessão, cookie
// `__Host-`, trava de força bruta escalonada, Turnstile, guarda de replay do
// TOTP. Diferenças daqui, todas pedidas pelo usuário (30/09):
//   • login por NOME DE USUÁRIO (as contas não têm e-mail);
//   • 2FA obrigatório para admin, e para os demais conforme `exige_2fa` —
//     o `operador` fica sem, para o acesso rápido no balcão;
//   • inatividade de 20 min para admin e 60 para os demais (o mesmo que o app
//     do Lovable fazia no navegador, agora valendo no servidor).
// ============================================================================
import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { banco } from "./banco";
import { gerarSecretTOTP, montarUrlTOTP, totpDecrypt, totpEncrypt, verificarTOTP } from "./totp";
import { acessoPermitido } from "@/lib/rede";

// Redes da empresa (config_acesso, migration 004). Lidas no máximo 1x por
// minuto por instância do Worker: são consultadas em TODA chamada de quem é
// restrito, e mudam quase nunca. Mudança na tela vale em até 1 minuto.
let cacheRedes: { redes: string[]; ate: number } | null = null;
export async function redesDaEmpresa(forcar = false): Promise<string[]> {
  if (!forcar && cacheRedes && cacheRedes.ate > Date.now()) return cacheRedes.redes;
  const { data } = await banco().from("config_acesso").select("redes_empresa").limit(1).maybeSingle();
  const redes: string[] = data?.redes_empresa ?? [];
  cacheRedes = { redes, ate: Date.now() + 60_000 };
  return redes;
}

export interface Usuario {
  id: string;
  nome: string;
  usuario: string;
  admin: boolean;
  exige_2fa: boolean;
  sessao_id: string;
  /** Permissões próprias (migration 003). null = usa o padrão (app_permissions). */
  permissoes: Record<string, boolean> | null;
}

export type RespostaLogin =
  | { ok: true; usuario: Pick<Usuario, "id" | "nome" | "usuario" | "admin" | "exige_2fa"> }
  | { precisaConfigurar2fa: true; secret: string; qrCodeUrl: string }
  | { precisaCodigo2fa: true }
  | { erro: string };

const INATIVIDADE_MIN_ADMIN = 20;
const INATIVIDADE_MIN_DEMAIS = 60;
const DURACAO_SESSAO_H = 12;

// ----------------------------------------------------------------------------
// Pedido: IP, dispositivo, cookie
// ----------------------------------------------------------------------------
export function ipDoPedido(): string {
  try {
    const r = getRequest();
    return (
      r.headers.get("CF-Connecting-IP") ||
      getRequestIP({ xForwardedFor: true }) ||
      "desconhecido"
    );
  } catch {
    return "desconhecido";
  }
}

function dispositivo(): string {
  const ua = getRequest().headers.get("User-Agent") || "";
  if (!ua) return "";
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "SO?";
  const nav = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "nav?";
  return `${so}/${nav}`;
}

// `__Host-` só em HTTPS: o navegador só aceita o prefixo com Secure, Path=/ e
// sem Domain — só ESTE endereço cria o cookie (nenhum outro subdomínio de
// kfsistema.com.br consegue plantar uma sessão aqui). Em http://localhost fica
// o nome sem prefixo, senão o login local pararia sem erro na tela.
function nomeCookie(): string {
  return new URL(getRequest().url).protocol === "https:" ? "__Host-kfm_sessao" : "kfm_sessao";
}

export function cookieSessao(valor: string, maxAgeSegundos: number): string {
  const seguro = nomeCookie().startsWith("__Host-") ? "; Secure" : "";
  return `${nomeCookie()}=${valor}; HttpOnly${seguro}; SameSite=Strict; Max-Age=${maxAgeSegundos}; Path=/`;
}

// Lê pelo NOME EXATO e só aceita os 64 hex de gerarToken().
function lerTokenSessao(): string | null {
  const nome = nomeCookie();
  for (const parte of (getRequest().headers.get("Cookie") || "").split(";")) {
    const i = parte.indexOf("=");
    if (i < 0 || parte.slice(0, i).trim() !== nome) continue;
    const valor = parte.slice(i + 1).trim();
    return /^[a-f0-9]{64}$/.test(valor) ? valor : null;
  }
  return null;
}

function gerarToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------------------------
// Senha
// ----------------------------------------------------------------------------
export async function hashSenha(senha: string): Promise<string> {
  const { data, error } = await banco().rpc("hash_senha", { senha });
  if (error || !data) throw new Error("Erro ao gerar hash de senha");
  return data as string;
}

// Usuário inexistente passa pelo MESMO bcrypt que senha errada — sem isso, o
// tempo de resposta dizia quais usuários existem. Custo 10, o mesmo das
// senhas reais. Não é segredo: não pertence a ninguém.
const HASH_FICTICIO = "$2a$10$QKoHhQXMpeTy3mWof/gJ9OyRahk/6WK1aJ8/sywDk7r6dCcLc7xRa";

async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  const { data, error } = await banco().rpc("verificar_senha", { senha, hash });
  return !error && data === true;
}

// Política de senha: em src/lib/senha.ts (pura, testada). Reexportada daqui
// porque admin-users.functions.ts a importa junto com hashSenha.
export { problemaSenha } from "@/lib/senha";

// ----------------------------------------------------------------------------
// Registro de acesso
// ----------------------------------------------------------------------------
export async function registrarAcesso(linha: {
  usuario_id?: string | null;
  usuario?: string | null;
  acao: string;
  detalhe?: string | null;
}) {
  await banco()
    .from("logs_acesso")
    .insert({ ip: ipDoPedido(), ...linha })
    .then(() => {}, () => {});
}

const det = (texto: string, disp: string) => (disp ? (texto ? `${texto} — ${disp}` : disp) : texto);

// Bloqueio por IP escalonado pela reincidência em 24h — mesma regra do
// kf-dashboard: 1º 10 min, 2º 30 min, 3º em diante 24 h.
const BLOQUEIO_ESCALA_MIN = [10, 30, 24 * 60];
const durMin = (detalhe: string | null) => {
  const m = String(detalhe || "").match(/dur_min:(\d+)/);
  return m ? parseInt(m[1], 10) : 10;
};
const fmtEspera = (min: number) => {
  if (min >= 60) {
    const h = Math.round(min / 60);
    return `${h} hora${h > 1 ? "s" : ""}`;
  }
  return `${min} minuto${min !== 1 ? "s" : ""}`;
};

async function turnstileOk(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // sem o segredo configurado, o anti-robô fica desligado
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: String(token || ""), remoteip: ip }),
    });
    return (await r.json()).success === true;
  } catch {
    return false; // fail closed: siteverify fora do ar NEGA o login
  }
}

// ----------------------------------------------------------------------------
// LOGIN — (1) usuário + senha [+ anti-robô], (2) código TOTP quando exigido
// ----------------------------------------------------------------------------
export async function entrar(dados: {
  usuario: string;
  senha: string;
  codigo?: string;
  turnstile?: string;
}): Promise<{ resposta: RespostaLogin; cookie?: string }> {
  const ip = ipDoPedido();
  const disp = dispositivo();
  const nomeUsuario = String(dados.usuario || "").trim().toLowerCase();
  const db = banco();

  if (!nomeUsuario || !dados.senha) return { resposta: { erro: "Informe usuário e senha." } };

  // Anti-robô ANTES de tocar no banco. Ação própria, fora da contagem de
  // falhas: token vencido não é tentativa de senha.
  if (!(await turnstileOk(dados.turnstile, ip))) {
    await registrarAcesso({ usuario: nomeUsuario, acao: "login_antirrobo", detalhe: det("verificação anti-robô falhou", disp) });
    return { resposta: { erro: "Verificação anti-robô falhou. Recarregue a página e tente novamente." } };
  }

  const agora = Date.now();
  if (ip !== "desconhecido") {
    const { data: ult } = await db
      .from("logs_acesso")
      .select("detalhe, criado_em")
      .eq("ip", ip)
      .eq("acao", "login_bloqueado")
      .order("criado_em", { ascending: false })
      .limit(1);
    if (ult?.[0]) {
      const ate = new Date(ult[0].criado_em).getTime() + durMin(ult[0].detalhe) * 60000;
      if (agora < ate) {
        return { resposta: { erro: `Muitas tentativas. Acesso bloqueado — tente novamente em ${fmtEspera(Math.ceil((ate - agora) / 60000))}.` } };
      }
    }
  }

  // 10 falhas do IP em 10 min → bloqueio escalonado. 5 falhas do usuário →
  // só um freio (sem gravar bloqueio): se gravasse, qualquer um derrubaria a
  // conta de outra pessoa errando a senha dela de propósito.
  const dezMin = new Date(agora - 10 * 60 * 1000).toISOString();
  const contar = (col: string, valor: string) =>
    db.from("logs_acesso").select("id", { count: "exact", head: true }).eq(col, valor).eq("acao", "login_falha").gt("criado_em", dezMin);
  const [{ count: falhasUsuario }, { count: falhasIp }] = await Promise.all([
    contar("usuario", nomeUsuario),
    ip !== "desconhecido" ? contar("ip", ip) : Promise.resolve({ count: 0 }),
  ]);
  if ((falhasIp ?? 0) >= 10) {
    const umDia = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
    const { count: anteriores } = await db
      .from("logs_acesso")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("acao", "login_bloqueado")
      .gt("criado_em", umDia);
    const nivel = Math.min(anteriores ?? 0, BLOQUEIO_ESCALA_MIN.length - 1);
    const dur = BLOQUEIO_ESCALA_MIN[nivel];
    await registrarAcesso({ usuario: nomeUsuario, acao: "login_bloqueado", detalhe: `dur_min:${dur}; nivel ${nivel + 1}; ${falhasIp} falhas do ip` });
    return { resposta: { erro: `Muitas tentativas. Acesso bloqueado por ${fmtEspera(dur)}.` } };
  }
  if ((falhasUsuario ?? 0) >= 5) {
    return { resposta: { erro: "Muitas tentativas para este usuário. Aguarde alguns minutos." } };
  }

  const { data: linhas } = await db
    .from("usuarios")
    .select("id, nome, usuario, senha_hash, admin, exige_2fa, totp_secret, totp_confirmado, totp_ultimo_uso, acesso_qualquer_rede")
    .eq("usuario", nomeUsuario)
    .eq("ativo", true)
    .limit(1);
  const u = linhas?.[0];

  // ── Redes permitidas (01/10): ANTES da senha. Quem está fora da rede não
  // chega nem a testar senha — por isso não conta como `login_falha` (não
  // escala bloqueio de IP) e não diz se a senha estava certa.
  if (u && !u.acesso_qualquer_rede && !acessoPermitido(ip, u, await redesDaEmpresa())) {
    await registrarAcesso({ usuario_id: u.id, usuario: u.usuario, acao: "login_fora_da_rede", detalhe: det(`IP ${ip} fora das redes permitidas`, disp) });
    return {
      resposta: {
        erro: `Este usuário só entra pela rede da empresa (seu IP agora: ${ip}). Se você está na empresa, peça ao administrador para liberar esta rede.`,
      },
    };
  }

  const senhaOk = await verificarSenha(dados.senha, u ? u.senha_hash : HASH_FICTICIO);
  if (!u || !senhaOk) {
    await registrarAcesso({
      usuario_id: u?.id ?? null,
      usuario: nomeUsuario,
      acao: "login_falha",
      detalhe: det(u ? "senha incorreta" : "usuário inexistente ou inativo", disp),
    });
    return { resposta: { erro: "Usuário ou senha inválidos." } };
  }

  // ── 2FA: sempre para admin; para os demais, conforme exige_2fa ──
  if (u.admin || u.exige_2fa) {
    if (!u.totp_confirmado) {
      const secret = gerarSecretTOTP();
      // Um QR pendente por vez, e cifrado como o definitivo (antes ficava em
      // texto puro e nunca saía do banco — ver confirmar2FA).
      await db.from("totp_setup_temp").delete().eq("usuario_id", u.id);
      await db.from("totp_setup_temp").insert({ usuario_id: u.id, secret: await totpEncrypt(secret) });
      return { resposta: { precisaConfigurar2fa: true, secret, qrCodeUrl: montarUrlTOTP(u.usuario, secret) } };
    }
    if (!dados.codigo) return { resposta: { precisaCodigo2fa: true } };

    const passo = await verificarTOTP(await totpDecrypt(u.totp_secret), dados.codigo);
    if (!passo) {
      await registrarAcesso({ usuario_id: u.id, usuario: u.usuario, acao: "login_falha", detalhe: det("código 2FA incorreto", disp) });
      return { resposta: { erro: "Código de verificação inválido." } };
    }
    // Replay: o mesmo código não entra duas vezes na janela em que ainda vale.
    if (passo <= (Number(u.totp_ultimo_uso) || 0)) {
      await registrarAcesso({ usuario_id: u.id, usuario: u.usuario, acao: "login_falha", detalhe: det("código 2FA reutilizado", disp) });
      return { resposta: { erro: "Código de verificação inválido." } };
    }
    await db.from("usuarios").update({ totp_ultimo_uso: passo }).eq("id", u.id);
  }

  const token = gerarToken();
  const { error: errSessao } = await db.from("sessoes").insert({
    usuario_id: u.id,
    token: await hashToken(token),
    ip,
    dispositivo: disp || null,
    expira_em: new Date(agora + DURACAO_SESSAO_H * 3600 * 1000).toISOString(),
    ultima_atividade: new Date(agora).toISOString(),
  });
  if (errSessao) return { resposta: { erro: "Erro ao criar a sessão. Tente novamente." } };

  await db.from("usuarios").update({ ultimo_acesso: new Date(agora).toISOString() }).eq("id", u.id);
  await registrarAcesso({ usuario_id: u.id, usuario: u.usuario, acao: "login_ok", detalhe: disp || null });

  return {
    resposta: { ok: true, usuario: { id: u.id, nome: u.nome, usuario: u.usuario, admin: u.admin, exige_2fa: u.exige_2fa } },
    cookie: cookieSessao(token, DURACAO_SESSAO_H * 3600),
  };
}

// Primeiro acesso com 2FA: confirma o primeiro código do app autenticador.
// Uma consulta só (QR pendente + usuário ativo), para não entregar pelo tempo
// de resposta quais usuários existem.
export async function confirmar2FA(dados: { usuario: string; codigo: string }) {
  const nomeUsuario = String(dados.usuario || "").trim().toLowerCase();
  const erroGenerico = { erro: "Não foi possível confirmar. Entre de novo para gerar um novo QR code." };
  if (!nomeUsuario || !dados.codigo) return erroGenerico;
  const db = banco();
  const { data: temp } = await db
    .from("totp_setup_temp")
    .select("secret, usuario_id, usuarios!inner(id, usuario, ativo)")
    .eq("usuarios.usuario", nomeUsuario)
    .eq("usuarios.ativo", true)
    .gt("expira_em", new Date().toISOString())
    .order("criado_em", { ascending: false })
    .limit(1);
  if (!temp?.[0]) return erroGenerico;
  const { secret: guardado, usuario_id } = temp[0];
  const secret = await totpDecrypt(guardado);
  if (!secret || !(await verificarTOTP(secret, dados.codigo))) {
    await registrarAcesso({ usuario_id, usuario: nomeUsuario, acao: "login_falha", detalhe: det("código incorreto na confirmação do 2FA", dispositivo()) });
    return { erro: "Código inválido. Confira o app e tente de novo." };
  }
  await db.from("usuarios").update({ totp_secret: await totpEncrypt(secret), totp_confirmado: true }).eq("id", usuario_id);
  // 🔴 APAGA o pendente (01/10): o padrão KF só marcava como vencido, e o
  // secret ficava para sempre em texto puro nesta tabela — anulando a cifra
  // do definitivo em `usuarios`. O definitivo fica SÓ cifrado, lá.
  await db.from("totp_setup_temp").delete().eq("usuario_id", usuario_id);
  await registrarAcesso({ usuario_id, usuario: nomeUsuario, acao: "2fa_configurado", detalhe: dispositivo() || null });
  return { ok: true as const };
}

// ----------------------------------------------------------------------------
// SESSÃO — conferida em toda chamada protegida
// ----------------------------------------------------------------------------
export async function verificarSessao(): Promise<Usuario | null> {
  const doCookie = lerTokenSessao();
  if (!doCookie) return null;
  const token = await hashToken(doCookie);
  const agora = new Date();
  // Uma ida ao banco: sessão + usuário juntos. `!inner` + ativo=true faz a
  // sessão de um usuário DESATIVADO deixar de valer na hora.
  const { data } = await banco()
    .from("sessoes")
    .select("id, criado_em, ultima_atividade, usuarios!inner(id, nome, usuario, admin, exige_2fa, ativo, acesso_qualquer_rede, permissoes)")
    .eq("token", token)
    .eq("ativo", true)
    .gt("expira_em", agora.toISOString())
    .eq("usuarios.ativo", true)
    .limit(1);
  const s = data?.[0];
  if (!s?.usuarios) return null;
  const u = s.usuarios;

  // Redes permitidas valem a sessão inteira, não só o login: o cookie levado
  // para fora da empresa (outro aparelho, 4G) deixa de valer — e a sessão é
  // encerrada, para não voltar a valer quando o aparelho voltar à rede.
  // (só consulta a lista da empresa para quem é restrito)
  if (!u.acesso_qualquer_rede && !acessoPermitido(ipDoPedido(), u, await redesDaEmpresa())) {
    await banco().from("sessoes").update({ ativo: false }).eq("id", s.id);
    await registrarAcesso({ usuario_id: u.id, usuario: u.usuario, acao: "sessao_fora_da_rede", detalhe: `IP ${ipDoPedido()}` });
    return null;
  }

  const limite = u.admin ? INATIVIDADE_MIN_ADMIN : INATIVIDADE_MIN_DEMAIS;
  const ultima = new Date(s.ultima_atividade ?? s.criado_em);
  const minutosInativo = (agora.getTime() - ultima.getTime()) / 60000;
  if (minutosInativo > limite) {
    await banco().from("sessoes").update({ ativo: false }).eq("id", s.id);
    return null;
  }
  // Grava a atividade no máximo 1x por minuto — não a cada chamada da tela.
  if (minutosInativo > 1) {
    await banco().from("sessoes").update({ ultima_atividade: agora.toISOString() }).eq("id", s.id);
  }
  return {
    id: u.id,
    nome: u.nome,
    usuario: u.usuario,
    admin: !!u.admin,
    exige_2fa: !!u.exige_2fa,
    sessao_id: s.id,
    permissoes: (u.permissoes as Record<string, boolean> | null) ?? null,
  };
}

export async function sair(): Promise<string> {
  const doCookie = lerTokenSessao();
  if (doCookie) {
    const token = await hashToken(doCookie);
    const { data } = await banco().from("sessoes").update({ ativo: false }).eq("token", token).select("usuario_id");
    const usuarioId = data?.[0]?.usuario_id;
    if (usuarioId) {
      const { data: u } = await banco().from("usuarios").select("usuario").eq("id", usuarioId).limit(1);
      await registrarAcesso({ usuario_id: usuarioId, usuario: u?.[0]?.usuario ?? null, acao: "logout", detalhe: dispositivo() || null });
    }
  }
  return cookieSessao("", 0);
}

// Confirmação por senha em ações destrutivas (arquivar, excluir). A senha é
// conferida NO SERVIDOR, contra a conta de quem está logado — antes o navegador
// conferia a senha do usuário "admin" e depois executava a ação por conta
// própria, então a confirmação não protegia nada.
export async function conferirSenhaDoAdmin(usuario: Usuario, senha: string): Promise<boolean> {
  if (!usuario.admin || !senha) return false;
  const { data } = await banco().from("usuarios").select("senha_hash").eq("id", usuario.id).limit(1);
  const ok = !!data?.[0] && (await verificarSenha(senha, data[0].senha_hash));
  if (!ok) await registrarAcesso({ usuario_id: usuario.id, usuario: usuario.usuario, acao: "confirmacao_falha", detalhe: "senha errada ao confirmar ação" });
  return ok;
}
