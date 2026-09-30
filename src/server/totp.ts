// ============================================================================
// TOTP (2FA) — geração/verificação de código e cifragem do secret em repouso
// ============================================================================
// 🔴 CÓPIA de kf-garantia/worker/src/totp.js (que por sua vez é cópia do
// kf-dashboard). RFC 6238 puro com a Web Crypto API, testado em produção contra
// Google Authenticator e Authy. Só mudou o emissor ("KF Marmita") e os tipos.
// ============================================================================

// Cifra o secret TOTP em repouso (AES-GCM) quando TOTP_ENC_KEY existe (base64
// de 32 bytes). Sem a chave, opera em texto puro — o 2FA funciona igual.
async function totpChave(): Promise<CryptoKey | null> {
  const b64chave = process.env.TOTP_ENC_KEY;
  if (!b64chave) return null;
  try {
    const raw = Uint8Array.from(atob(b64chave), (c) => c.charCodeAt(0));
    if (raw.length !== 32) return null;
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (str: string) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export async function totpEncrypt(texto: string): Promise<string> {
  const key = await totpChave();
  if (!key || !texto) return texto;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(texto)));
  return `enc:v1:${b64(iv)}:${b64(ct)}`;
}

// Devolve o secret em texto puro, ou null se estava cifrado e não há como decifrar.
export async function totpDecrypt(armazenado: string | null): Promise<string | null> {
  if (typeof armazenado !== "string" || !armazenado.startsWith("enc:v1:")) return armazenado;
  const key = await totpChave();
  if (!key) return null;
  try {
    const [, , ivB64, ctB64] = armazenado.split(":");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(ivB64) }, key, deB64(ctB64));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array) {
  let bits = "";
  let saida = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5) saida += ALFABETO[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return saida;
}

function base32Decode(str: string) {
  let bits = "";
  for (const c of str.toUpperCase().replace(/=+$/, "")) {
    const idx = ALFABETO.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

export function gerarSecretTOTP() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function montarUrlTOTP(usuario: string, secret: string) {
  const emissor = "KF Marmita";
  const label = encodeURIComponent(`${emissor}:${usuario}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}

async function gerarCodigoTOTP(secretBase32: string, timeStep: number) {
  const counter = new ArrayBuffer(8);
  new DataView(counter).setUint32(4, timeStep, false);
  const cryptoKey = await crypto.subtle.importKey("raw", base32Decode(secretBase32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counter));
  const offset = bytes[bytes.length - 1] & 0x0f;
  const codeInt =
    ((bytes[offset] & 0x7f) << 24) | ((bytes[offset + 1] & 0xff) << 16) | ((bytes[offset + 2] & 0xff) << 8) | (bytes[offset + 3] & 0xff);
  return String(codeInt % 1000000).padStart(6, "0");
}

// Janela de ±1 passo (±30s) para tolerar relógio. Devolve o PASSO que casou
// (para a guarda de replay) ou null.
export async function verificarTOTP(secretBase32: string | null, codigoDigitado: string) {
  if (!secretBase32 || !codigoDigitado) return null;
  const agora = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -1; delta <= 1; delta++) {
    if ((await gerarCodigoTOTP(secretBase32, agora + delta)) === String(codigoDigitado).trim()) return agora + delta;
  }
  return null;
}
