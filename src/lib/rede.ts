// Confere se um IP está numa lista de redes (IP exato ou faixa CIDR), IPv4 e
// IPv6. Usado para prender um usuário (o `operador`, que entra sem 2FA) às
// redes da empresa e para limitar de onde a rota do RH aceita chamadas.
// Pura e testada (tests/rede.test.ts).

type Rede = { familia: 4 | 6; base: bigint; bits: number };

function ipv4(ip: string): bigint | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  let n = 0n;
  for (const parte of m.slice(1)) {
    const v = Number(parte);
    if (v > 255) return null;
    n = (n << 8n) | BigInt(v);
  }
  return n;
}

function ipv6(ip: string): bigint | null {
  let s = ip.toLowerCase().trim();
  if (!s.includes(":")) return null;
  // IPv4 no fim (::ffff:1.2.3.4) vira os dois últimos grupos.
  const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipv4(v4[2]);
    if (n === null) return null;
    s = `${v4[1]}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const metades = s.split("::");
  if (metades.length > 2) return null;
  const esq = metades[0] ? metades[0].split(":") : [];
  const dir = metades.length === 2 && metades[1] ? metades[1].split(":") : [];
  const faltam = 8 - esq.length - dir.length;
  if (metades.length === 2 ? faltam < 1 : faltam !== 0) return null;
  const grupos = [...esq, ...Array(metades.length === 2 ? faltam : 0).fill("0"), ...dir];
  let n = 0n;
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

function ler(ip: string): { familia: 4 | 6; n: bigint } | null {
  const a = ipv4(ip.trim());
  if (a !== null) return { familia: 4, n: a };
  const b = ipv6(ip);
  if (b !== null) return { familia: 6, n: b };
  return null;
}

/** "177.73.89.230", "200.10.135.0/24", "2804:1874:a033:bd00::/64" → Rede, ou null se inválida. */
export function lerRede(texto: string): Rede | null {
  const [ip, barra, ...resto] = texto.trim().split("/");
  if (resto.length) return null;
  const end = ler(ip);
  if (!end) return null;
  const largura = end.familia === 4 ? 32 : 128;
  const bits = barra === undefined ? largura : Number(barra);
  if (!Number.isInteger(bits) || bits < 0 || bits > largura || (barra !== undefined && !/^\d+$/.test(barra))) return null;
  // Zera os bits de host: "200.10.135.16/24" vale como 200.10.135.0/24.
  const host = BigInt(largura - bits);
  return { familia: end.familia, base: (end.n >> host) << host, bits };
}

export const redeValida = (texto: string) => lerRede(texto) !== null;

/**
 * O que cadastrar para liberar "a rede daqui": o próprio IP (IPv4) ou a faixa
 * /64 (IPv6 — o endereço do aparelho muda sozinho dentro dela, a faixa não).
 */
export function faixaSugerida(ip: string): string | null {
  const end = ler(ip);
  if (!end) return null;
  if (end.familia === 4) return ip.trim();
  const grupos: string[] = [];
  for (let i = 7; i >= 4; i--) grupos.push(((end.n >> BigInt(i * 16)) & 0xffffn).toString(16));
  return `${grupos.join(":")}::/64`;
}

/**
 * A REGRA DE ACESSO (migration 004): quem tem "pode entrar de qualquer rede"
 * entra de qualquer lugar; os demais só de uma rede da empresa. Lista da
 * empresa VAZIA = ninguém é restrito (não dá para trancar todo mundo para fora
 * por engano).
 */
export function acessoPermitido(
  ip: string | null | undefined,
  usuario: { acesso_qualquer_rede?: boolean | null },
  redesEmpresa: string[] | null | undefined,
): boolean {
  if (usuario.acesso_qualquer_rede) return true;
  return ipPermitido(ip, redesEmpresa);
}

/**
 * O IP está em alguma das redes? Lista vazia/nula = SEM restrição (true).
 * IP ilegível com restrição configurada = false (na dúvida, nega).
 */
export function ipPermitido(ip: string | null | undefined, redes: string[] | null | undefined): boolean {
  if (!redes || redes.length === 0) return true;
  const end = ip ? ler(ip) : null;
  if (!end) return false;
  for (const texto of redes) {
    const r = lerRede(texto);
    if (!r || r.familia !== end.familia) continue;
    const host = BigInt((r.familia === 4 ? 32 : 128) - r.bits);
    if ((end.n >> host) << host === r.base) return true;
  }
  return false;
}
