// Contrato com o kf-rh — o que ele espera de cada lançamento (ver CLAUDE.md).
import { describe, expect, test } from "bun:test";
import { dinheiro, iguaisSeguro, lerCursor, montarLancamento, paraSaoPaulo } from "@/lib/rh";

describe("cursor da paginação", () => {
  const ok = "2026-09-29T20:38:40.581726+00:00|0371248e-1f06-4ee5-b767-40284178ca86";
  test("aceita o que o servidor gera", () => {
    expect(lerCursor(ok)).toEqual({ momento: "2026-09-29T20:38:40.581726+00:00", id: "0371248e-1f06-4ee5-b767-40284178ca86" });
    expect(lerCursor("2026-09-29T20:38:40Z|0371248e-1f06-4ee5-b767-40284178ca86")).not.toBeNull();
  });
  // Os pedaços entram DENTRO do filtro .or() do PostgREST.
  test("recusa injeção de filtro", () => {
    for (const c of [
      "x,id.gt.0|0371248e-1f06-4ee5-b767-40284178ca86",
      "2026-09-29T20:38:40Z,id.gt.0|0371248e-1f06-4ee5-b767-40284178ca86",
      "2026-09-29T20:38:40Z|0371248e-1f06-4ee5-b767-40284178ca86),or(id.gt.0",
      `${ok}|extra`,
      "abc",
      "",
    ]) {
      expect(lerCursor(c)).toBeNull();
    }
  });
});

describe("formato do lançamento", () => {
  const base = {
    id: "a1",
    taken_at: "2026-09-29T20:38:40.581726+00:00",
    unit_price: "9.00",
    company_unit_price: 20,
    meal_types: { key: "normal", suppliers: { name: "Lider" } },
  };
  const func = { name: "Fulano", cpf: "165.093.312-68", company: "KF", sector: "Operacional", vinculo: "clt" };

  test("momento ISO com fuso de São Paulo; CPF só dígitos; valores numéricos", () => {
    const l = montarLancamento(base, func);
    expect(l.momento).toBe("2026-09-29T17:38:40-03:00");
    expect(l.cpf).toBe("16509331268");
    expect(l.valor_funcionario).toBe(9);
    expect(l.valor_empresa).toBe(20);
    expect(l.tipo).toBe("normal");
    expect(l.fornecedor).toBe("Lider");
    expect(l.cancelado).toBe(false);
    expect(l.observacao).toBeNull();
  });
  test("cancelado vai marcado, com o motivo em observacao", () => {
    const l = montarLancamento({ ...base, cancelado: true, motivo_cancelamento: "Lançado em duplicidade" }, func);
    expect(l.cancelado).toBe(true);
    expect(l.observacao).toBe("Lançado em duplicidade");
  });
  test("CPF incompleto vira null (nunca 000.000.000-00)", () => {
    expect(montarLancamento(base, { ...func, cpf: "123" }).cpf).toBeNull();
    expect(montarLancamento(base, undefined).cpf).toBeNull();
  });
  test("vínculo padrão clt", () => {
    expect(montarLancamento(base, { ...func, vinculo: null }).vinculo).toBe("clt");
  });
});

describe("utilitários", () => {
  test("paraSaoPaulo", () => expect(paraSaoPaulo("2026-01-01T02:00:00.000Z")).toBe("2025-12-31T23:00:00-03:00"));
  test("dinheiro arredonda a centavo", () => {
    expect(dinheiro(0.1 + 0.2)).toBe(0.3);
    expect(dinheiro(null)).toBe(0);
  });
  test("iguaisSeguro", () => {
    expect(iguaisSeguro("abc", "abc")).toBe(true);
    expect(iguaisSeguro("abc", "abd")).toBe(false);
    expect(iguaisSeguro("abc", "abcd")).toBe(false);
    expect(iguaisSeguro("", "")).toBe(false);
  });
});
