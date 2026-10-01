import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { problemaSenha } from "@/lib/senha";
import { gerarSecretTOTP, montarUrlTOTP, totpDecrypt, totpEncrypt, verificarTOTP } from "@/server/totp";

describe("política de senha", () => {
  test("aceita senha boa", () => {
    expect(problemaSenha("Cavalo-Verde-Laranja-42")).toBeNull();
  });
  test("recusa com o motivo", () => {
    expect(problemaSenha("curta")).toContain("mínimo");
    expect(problemaSenha("aaaaaaaaaaaa")).toContain("repetido");
    expect(problemaSenha("minhaSenhaForte")).toContain("óbvio");
    expect(problemaSenha("Marmita2026!x")).toContain("óbvio");
    expect(problemaSenha("x12345abcdefz")).toContain("sequências");
    expect(problemaSenha("Lucimara#Beta77", { nome: "Lucimara Souza" })).toContain("nome");
  });
});

// RFC 6238, apêndice B (SHA-1): segredo ASCII "12345678901234567890".
const SEGREDO = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP", () => {
  afterEach(() => setSystemTime());

  test("vetores oficiais da RFC 6238 (6 dígitos)", async () => {
    setSystemTime(new Date(59 * 1000));
    expect(await verificarTOTP(SEGREDO, "287082")).toBe(1);
    setSystemTime(new Date(1111111109 * 1000));
    expect(await verificarTOTP(SEGREDO, "081804")).toBe(Math.floor(1111111109 / 30));
  });
  test("código errado ou vazio", async () => {
    setSystemTime(new Date(59 * 1000));
    expect(await verificarTOTP(SEGREDO, "000000")).toBeNull();
    expect(await verificarTOTP(SEGREDO, "")).toBeNull();
    expect(await verificarTOTP(null, "287082")).toBeNull();
  });
  test("tolera ±30 s de relógio, não mais", async () => {
    setSystemTime(new Date((59 + 30) * 1000)); // um passo depois
    expect(await verificarTOTP(SEGREDO, "287082")).toBe(1);
    setSystemTime(new Date((59 + 90) * 1000)); // três passos depois
    expect(await verificarTOTP(SEGREDO, "287082")).toBeNull();
  });
  test("segredo novo e URL do QR", () => {
    const s = gerarSecretTOTP();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const url = montarUrlTOTP("admin", s);
    expect(url).toStartWith("otpauth://totp/KF%20Marmita%3Aadmin?secret=");
    expect(url).toContain("issuer=KF%20Marmita");
  });
  test("cifra do segredo em repouso (com e sem TOTP_ENC_KEY)", async () => {
    const antes = process.env.TOTP_ENC_KEY;
    try {
      delete process.env.TOTP_ENC_KEY;
      expect(await totpEncrypt("ABC")).toBe("ABC");
      process.env.TOTP_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
      const cifrado = await totpEncrypt(SEGREDO);
      expect(cifrado).toStartWith("enc:v1:");
      expect(await totpDecrypt(cifrado)).toBe(SEGREDO);
      expect(await totpDecrypt(SEGREDO)).toBe(SEGREDO); // texto puro antigo continua lido
      process.env.TOTP_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
      expect(await totpDecrypt(cifrado)).toBeNull(); // chave errada não decifra
    } finally {
      if (antes === undefined) delete process.env.TOTP_ENC_KEY;
      else process.env.TOTP_ENC_KEY = antes;
    }
  });
});
