import { describe, expect, test } from "bun:test";
import { competencia, competenciaDe, competenciaSomar, diaLocal, formatarCPF, lerValor, soDigitos } from "@/lib/formatos";

describe("lerValor — valor em reais digitado", () => {
  test("formatos aceitos", () => {
    expect(lerValor("9,50")).toBe(9.5);
    expect(lerValor("R$ 9,00")).toBe(9); // virava 0 sem aviso até 30/09
    expect(lerValor("r$9,00")).toBe(9);
    expect(lerValor("1.234,56")).toBe(1234.56); // virava 1,234 até 30/09
    expect(lerValor("9.5")).toBe(9.5);
    expect(lerValor("20")).toBe(20);
    expect(lerValor("")).toBe(0);
  });
  test("inválidos viram NaN (a tela recusa)", () => {
    for (const v of ["abc", "9,999", "1,2,3", "-5", "9 reais", "1.2.3"]) expect(lerValor(v)).toBeNaN();
  });
});

describe("CPF", () => {
  test("soDigitos", () => {
    expect(soDigitos("165.093.312-68")).toBe("16509331268");
    expect(soDigitos(null)).toBe("");
  });
  test("formatarCPF, inclusive parcial (máscara de digitação)", () => {
    expect(formatarCPF("00000000191")).toBe("000.000.001-91");
    expect(formatarCPF("000.000.001-91")).toBe("000.000.001-91");
    expect(formatarCPF("0000")).toBe("000.0");
    expect(formatarCPF("000000001912222")).toBe("000.000.001-91");
  });
  // O bug de 30/09: o botão Salvar comparava `cpf.replace(/D/g, "")` (sem a
  // barra) com 11 — um CPF formatado nunca tinha 11 caracteres.
  test("CPF formatado tem 11 dígitos", () => {
    expect(soDigitos(formatarCPF("16509331268")).length).toBe(11);
  });
});

describe("datas locais", () => {
  test("diaLocal não vira o dia às 21h (UTC)", () => {
    expect(diaLocal(new Date(2026, 8, 30, 23, 30))).toBe("2026-09-30");
  });
});

describe("competência da folha (26 a 25, igual ao kf-rh)", () => {
  test("08/2026 = 26/07 a 25/08", () => {
    const c = competencia(2026, 8);
    expect(c.codigo).toBe("08/2026");
    expect(diaLocal(c.inicio)).toBe("2026-07-26");
    expect(diaLocal(c.fim)).toBe("2026-08-26"); // fim exclusivo
    expect(c.rotulo).toBe("Competência ago/2026 (26/07 a 25/08)");
  });
  test("virada de ano", () => {
    const c = competencia(2027, 1);
    expect(diaLocal(c.inicio)).toBe("2026-12-26");
    expect(diaLocal(c.fim)).toBe("2027-01-26");
  });
  test("em que competência cai uma data", () => {
    expect(competenciaDe(new Date(2026, 8, 25)).codigo).toBe("09/2026");
    expect(competenciaDe(new Date(2026, 8, 26)).codigo).toBe("10/2026");
    expect(competenciaDe(new Date(2026, 11, 27)).codigo).toBe("01/2027");
  });
  test("andar para trás e para frente", () => {
    expect(competenciaSomar({ ano: 2026, mes: 1 }, -1).codigo).toBe("12/2025");
    expect(competenciaSomar({ ano: 2026, mes: 12 }, 1).codigo).toBe("01/2027");
  });
});
