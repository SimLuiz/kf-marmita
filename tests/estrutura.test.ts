// ============================================================================
// REGRAS DE ESTRUTURA — lidas no código-fonte, sem rodar o sistema
// ============================================================================
// Cada regra existe por causa de um erro real:
//  • 30/09: a limpeza de dados pedia a senha na tela mas o servidor não
//    conferia → "ação destrutiva confere a senha no servidor";
//  • 30/09: `/\D/` virou `/D/` numa edição por shell e travou o botão Salvar
//    → "regex sem barra invertida";
//  • Lovable: telas falando direto com o banco → "nenhuma tela usa o banco".
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dir, "..", "src");

function arquivos(dir: string, filtro: RegExp): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivos(p, filtro));
    else if (filtro.test(nome)) saida.push(p);
  }
  return saida;
}
const ler = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => relative(join(RAIZ, ".."), p).replaceAll("\\", "/");

// Cada `export const X = createServerFn(...)` com o trecho até o próximo export.
function funcoesDoServidor() {
  const saida: { arquivo: string; nome: string; corpo: string }[] = [];
  for (const arq of arquivos(join(RAIZ, "lib"), /\.functions\.ts$/)) {
    const texto = ler(arq);
    const partes = texto.split(/\nexport const /).slice(1);
    for (const parte of partes) {
      const nome = parte.match(/^(\w+)\s*=/)?.[1];
      if (nome && /^\w+\s*=\s*createServerFn\(/.test(parte)) saida.push({ arquivo: rel(arq), nome, corpo: parte });
    }
  }
  return saida;
}

// Funções que rodam SEM sessão, de propósito (é o próprio login).
const PUBLICAS = new Set(["eu", "entrar", "confirmar2fa", "sair"]);

describe("servidor", () => {
  const fns = funcoesDoServidor();

  test("achou as server functions (sanidade do próprio teste)", () => {
    expect(fns.length).toBeGreaterThan(40);
  });

  test("toda server function exige sessão (comSessao ou soAdmin), exceto o login", () => {
    const sem = fns
      .filter((f) => !PUBLICAS.has(f.nome))
      .filter((f) => !/\.middleware\(\[(comSessao|soAdmin)\]\)/.test(f.corpo))
      .map((f) => `${f.arquivo}: ${f.nome}`);
    expect(sem).toEqual([]);
  });

  test("ação destrutiva confere a senha do admin NO SERVIDOR", () => {
    const destrutivas = fns.filter((f) =>
      /^(excluir|arquivar|cancelar|reativar|definirAtivo|definirAdmin|definirRedes|definirAcessoQualquerRede|executePurge)/.test(f.nome),
    );
    expect(destrutivas.length).toBeGreaterThanOrEqual(10);
    const sem = destrutivas.filter((f) => !f.corpo.includes("exigirSenhaAdmin(")).map((f) => `${f.arquivo}: ${f.nome}`);
    expect(sem).toEqual([]);
  });

  test("ação destrutiva é só de admin", () => {
    const sem = fns
      .filter((f) => /^(excluir|arquivar|cancelar|reativar|definir|executePurge|resetar|encerrar|listarSessoes)/.test(f.nome))
      .filter((f) => !f.corpo.includes(".middleware([soAdmin])"))
      .map((f) => `${f.arquivo}: ${f.nome}`);
    expect(sem).toEqual([]);
  });

  test("troca da própria senha é só de admin (pedido de 30/09)", () => {
    const f = fns.find((x) => x.nome === "trocarMinhaSenha");
    expect(f?.corpo).toContain(".middleware([soAdmin])");
  });
});

describe("telas", () => {
  const telas = [...arquivos(join(RAIZ, "routes"), /\.tsx$/), ...arquivos(join(RAIZ, "components"), /\.tsx$/)];

  test("todo diálogo de senha repassa a senha digitada (quem confere é o servidor)", () => {
    const erradas: string[] = [];
    for (const arq of telas) {
      for (const m of ler(arq).matchAll(/onConfirmed=\{async \(([^)]*)\)/g)) {
        if (!m[1].trim()) erradas.push(rel(arq));
      }
    }
    expect(erradas).toEqual([]);
  });

  test("nenhuma tela fala direto com o banco", () => {
    const erradas = telas.filter((arq) => /integrations\/supabase\/client"|supabase\.(from|storage|rpc)\(/.test(ler(arq))).map(rel);
    expect(erradas).toEqual([]);
  });
});

export const REGEX_SEM_BARRA = /(^|[(,=:!&|?{;[]|return)\s*\/\^?[DdSsWw](\{|\+|\*|\/g|\/\)|\/,|\/\.)/;

describe("a própria regra de regex pega os casos reais", () => {
  test("pega", () => {
    for (const linha of [
      'disabled={!name.trim() || cpf.replace(/D/g, "").length !== 11}>', // o bug de 30/09
      'const t = v.replace(/s/g, "");',
      "if (!/^d+(.d{1,2})?$/.test(t)) return NaN;",
      "return /d{11}/.test(x);",
    ]) {
      expect(REGEX_SEM_BARRA.test(linha)).toBe(true);
    }
  });
  test("não acusa o que está certo", () => {
    for (const linha of [
      'const d = v.replace(/\\D/g, "");',
      'if (!/^\\d+$/.test(t)) return NaN;',
      'navigate({ to: "/funcionarios" })',
      'href="/dashboard"',
      "const url = `${base}/d/${id}`;",
    ]) {
      expect(REGEX_SEM_BARRA.test(linha)).toBe(false);
    }
  });
});

describe("código", () => {
  const todos = arquivos(RAIZ, /\.(ts|tsx)$/).filter((p) => !p.endsWith("routeTree.gen.ts"));

  test("nenhuma regex perdeu a barra invertida (/D/, /d{3}/, /s/g…)", () => {
    const suspeitas: string[] = [];
    for (const arq of todos) {
      ler(arq)
        .split("\n")
        .forEach((linha, i) => {
          // literal de regex (depois de ( , = : ! & | ? { ; [ ou return) com uma
          // "classe" sem a barra: /D/g, /d{3}/, /^d+/, /s/g…
          if (REGEX_SEM_BARRA.test(linha)) suspeitas.push(`${rel(arq)}:${i + 1}: ${linha.trim()}`);
        });
    }
    expect(suspeitas).toEqual([]);
  });

  test("código de servidor (src/server) só é importado por tipo fora do servidor", () => {
    const erradas: string[] = [];
    for (const arq of todos.filter((p) => !rel(p).startsWith("src/server/"))) {
      for (const m of ler(arq).matchAll(/^import\s+(?!type\b)[^;]*from\s+"@\/server\/[^"]+"/gm)) erradas.push(`${rel(arq)}: ${m[0]}`);
    }
    expect(erradas).toEqual([]);
  });
});
