import { describe, expect, test } from "bun:test";
import { acessoPermitido, faixaSugerida, ipPermitido, lerRede, redeValida } from "@/lib/rede";

// As redes reais da empresa (logins de jul–set/2026).
const EMPRESA = ["200.10.135.16", "177.73.89.230", "177.235.48.159", "2804:1874:a033:bd00::/64"];

describe("ipPermitido", () => {
  test("lista vazia/nula = sem restrição", () => {
    expect(ipPermitido("8.8.8.8", null)).toBe(true);
    expect(ipPermitido("8.8.8.8", [])).toBe(true);
  });
  test("IPv4 exato", () => {
    expect(ipPermitido("177.73.89.230", EMPRESA)).toBe(true);
    expect(ipPermitido("177.73.89.231", EMPRESA)).toBe(false);
    expect(ipPermitido("45.181.73.8", EMPRESA)).toBe(false);
  });
  test("IPv4 faixa", () => {
    expect(ipPermitido("200.10.135.200", ["200.10.135.0/24"])).toBe(true);
    expect(ipPermitido("200.10.136.1", ["200.10.135.0/24"])).toBe(false);
    expect(ipPermitido("1.2.3.4", ["0.0.0.0/0"])).toBe(true);
  });
  test("IPv6 /64 — o celular/tablet troca o final do endereço sozinho", () => {
    expect(ipPermitido("2804:1874:a033:bd00:c46b:8ff:140b:e58b", EMPRESA)).toBe(true);
    expect(ipPermitido("2804:1874:a033:bd00:65bf:e524:67d7:4ccd", EMPRESA)).toBe(true);
    expect(ipPermitido("2804:1874:a033:bd01::1", EMPRESA)).toBe(false);
    expect(ipPermitido("2804:14c:6543:45c2:1e2:fb05:58a0:c8aa", EMPRESA)).toBe(false);
  });
  test("IPv6 com :: e maiúsculas", () => {
    expect(ipPermitido("2804:1874:A033:BD00::1", EMPRESA)).toBe(true);
    expect(ipPermitido("::1", ["::1"])).toBe(true);
  });
  test("família diferente não casa", () => {
    expect(ipPermitido("177.73.89.230", ["2804:1874:a033:bd00::/64"])).toBe(false);
  });
  test("na dúvida, nega", () => {
    expect(ipPermitido(null, EMPRESA)).toBe(false);
    expect(ipPermitido("desconhecido", EMPRESA)).toBe(false);
    expect(ipPermitido("999.1.1.1", EMPRESA)).toBe(false);
  });
});

describe("lerRede / redeValida", () => {
  test("válidas", () => {
    for (const r of ["177.73.89.230", "200.10.135.0/24", "2804:1874:a033:bd00::/64", "::1", "::/0"]) expect(redeValida(r)).toBe(true);
  });
  test("inválidas", () => {
    for (const r of ["", "177.73.89", "177.73.89.230/33", "abc", "1.2.3.4/x", "2804::1874::1", "1.2.3.4/24/1"]) expect(redeValida(r)).toBe(false);
  });
  test("bits de host são zerados", () => {
    expect(lerRede("200.10.135.16/24")).toEqual(lerRede("200.10.135.0/24"));
  });
});

// Pedido de 01/10: alguns usuários (o admin, por exemplo) entram de qualquer
// rede; os demais só das redes da empresa.
describe("acessoPermitido", () => {
  const operador = { acesso_qualquer_rede: false };
  const admin = { acesso_qualquer_rede: true };
  test("quem pode qualquer rede entra de fora", () => {
    expect(acessoPermitido("45.181.73.8", admin, EMPRESA)).toBe(true);
    expect(acessoPermitido(null, admin, EMPRESA)).toBe(true);
  });
  test("os demais só da empresa", () => {
    expect(acessoPermitido("177.73.89.230", operador, EMPRESA)).toBe(true);
    expect(acessoPermitido("2804:1874:a033:bd00:9:8:7:6", operador, EMPRESA)).toBe(true);
    expect(acessoPermitido("45.181.73.8", operador, EMPRESA)).toBe(false);
    expect(acessoPermitido(null, operador, EMPRESA)).toBe(false);
    expect(acessoPermitido("45.181.73.8", {}, EMPRESA)).toBe(false);
  });
  test("lista da empresa vazia = ninguém restrito (não tranca todo mundo)", () => {
    expect(acessoPermitido("45.181.73.8", operador, [])).toBe(true);
    expect(acessoPermitido("45.181.73.8", operador, null)).toBe(true);
  });
});

describe("faixaSugerida", () => {
  test("IPv4: o próprio IP", () => {
    expect(faixaSugerida("177.73.89.230")).toBe("177.73.89.230");
  });
  test("IPv6: a faixa /64 (o endereço do aparelho muda dentro dela)", () => {
    expect(faixaSugerida("2804:1874:a033:bd00:1234:5678:9abc:def0")).toBe("2804:1874:a033:bd00::/64");
    expect(faixaSugerida("2804:14c::1")).toBe("2804:14c:0:0::/64");
    const f = faixaSugerida("2804:14c:6543:45c2:aa:bb:cc:dd")!;
    expect(redeValida(f)).toBe(true);
    expect(ipPermitido("2804:14c:6543:45c2:1:2:3:4", [f])).toBe(true);
  });
  test("lixo: null", () => {
    expect(faixaSugerida("abc")).toBeNull();
  });
});
