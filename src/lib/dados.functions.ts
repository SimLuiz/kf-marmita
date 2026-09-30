// ============================================================================
// DADOS — tudo o que as telas leem e gravam, conferido no servidor
// ============================================================================
// Antes (Lovable) cada tela falava direto com o banco a partir do navegador,
// com a chave pública, e quem decidia o que podia era a política RLS — que
// estava aberta ("using (true)") em 6 tabelas. Agora o navegador só chama estas
// funções; cada uma confere sessão, permissão e, nas destrutivas, a senha do
// admin, e o banco fica fechado para o navegador (migration 002).
//
// 🔴 PREÇO VEM SEMPRE DO BANCO. O app antigo mandava `unit_price` a partir do
// navegador ao registrar/editar um lançamento — dava para gravar o valor que
// quisesse. Aqui o valor é o do tipo de marmita no momento do registro.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { comSessao, soAdmin, exigirPermissao, exigirSenhaAdmin, temPermissao } from "./middleware";

const BUCKET = "meal-photos";
const VALIDADE_URL_S = 60 * 60;
const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const texto = (max = 100) => z.string().trim().min(1, "Preencha todos os campos").max(max);
const VINCULOS = ["clt", "pj", "visitante", "aniversariante"] as const;

// PostgREST devolve no máximo 1000 linhas por vez.
async function todas<T = any>(consulta: (de: number, ate: number) => any): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    saida.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000 || de > 200000) return saida;
  }
}

function formatarCPF(digitos: string) {
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function erroDeCPF(error: any): never {
  if (error?.code === "23505" || String(error?.message).includes("cpf_duplicado")) {
    throw new Error("Já existe um funcionário com esse CPF");
  }
  throw new Error(error?.message ?? "Erro ao salvar");
}

async function urlsAssinadas(db: any, caminhos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(caminhos.filter(Boolean))];
  const mapa: Record<string, string> = {};
  for (let i = 0; i < unicos.length; i += 500) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(unicos.slice(i, i + 500), VALIDADE_URL_S);
    for (const s of data ?? []) if (s.signedUrl && s.path) mapa[s.path] = s.signedUrl;
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
export const resumoInicio = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ inicioDia: iso, inicioMes: iso }).parse(i))
  .handler(async ({ context: { db }, data }) => {
    const contar = (q: any) => q.then((r: any) => r.count ?? 0);
    const [funcionarios, hoje, mes] = await Promise.all([
      contar(db.from("employees").select("id", { count: "exact", head: true }).is("archived_at", null)),
      contar(db.from("meal_records").select("id", { count: "exact", head: true }).gte("taken_at", data.inicioDia)),
      contar(db.from("meal_records").select("id", { count: "exact", head: true }).gte("taken_at", data.inicioMes)),
    ]);
    return { funcionarios, hoje, mes };
  });

// ---------------------------------------------------------------------------
// Permissões (o que o usuário comum pode fazer)
// ---------------------------------------------------------------------------
export const obterPermissoes = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .handler(async ({ context: { db } }) => {
    const { data } = await db.from("app_permissions").select("*").limit(1).maybeSingle();
    return data ?? null;
  });

const CHAVES_PERMISSAO = ["can_create_employees", "can_edit_employees", "can_manage_suppliers", "can_edit_records", "can_backdate_records"] as const;

export const salvarPermissao = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ chave: z.enum(CHAVES_PERMISSAO), valor: z.boolean() }).parse(i))
  .handler(async ({ context: { db }, data }) => {
    const { error } = await db.from("app_permissions").update({ [data.chave]: data.valor }).eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Funcionários
// ---------------------------------------------------------------------------
export const listarFuncionarios = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .handler(async ({ context: { db } }) =>
    todas((de, ate) =>
      db
        .from("employees_view")
        .select("id,name,cpf,company,sector,vinculo,created_at")
        .is("archived_at", null)
        .order("name")
        .range(de, ate),
    ),
  );

export const obterFuncionario = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ context: { db }, data }) => {
    const { data: f, error } = await db
      .from("employees_view")
      .select("id,name,cpf,company,sector,vinculo")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return f ?? null;
  });

// Cadastro e edição com as MESMAS regras (pedido de 17/09 que ficou pela
// metade no Lovable): tudo obrigatório e CPF com 11 dígitos, nos dois.
const dadosFuncionario = z.object({
  name: texto(),
  cpf: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 11, "CPF deve ter 11 dígitos"),
  company: texto(),
  sector: texto(),
  vinculo: z.enum(VINCULOS),
});

export const criarFuncionario = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => dadosFuncionario.parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_create_employees");
    const { error } = await context.db.from("employees").insert({
      ...data,
      cpf: formatarCPF(data.cpf),
      owner_id: context.usuario.id,
    });
    if (error) erroDeCPF(error);
    return { ok: true };
  });

export const editarFuncionario = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => dadosFuncionario.extend({ id: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_edit_employees");
    const { id, ...campos } = data;
    const { error } = await context.db
      .from("employees")
      .update({ ...campos, cpf: formatarCPF(campos.cpf) })
      .eq("id", id);
    if (error) erroDeCPF(error);
    return { ok: true };
  });

export const arquivarFuncionario = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    const { error } = await context.db.from("employees").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Fornecedores e tipos de marmita
// ---------------------------------------------------------------------------
export const cadastroMarmitas = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .handler(async ({ context: { db } }) => {
    const [fornecedores, tipos] = await Promise.all([
      todas((de, ate) => db.from("suppliers").select("id,name").order("name").range(de, ate)),
      todas((de, ate) =>
        db
          .from("meal_types")
          .select("id,supplier_id,name,price,company_price,key")
          .is("archived_at", null)
          .order("name")
          .range(de, ate),
      ),
    ]);
    return {
      fornecedores,
      tipos: tipos.map((t: any) => ({ ...t, price: Number(t.price), company_price: Number(t.company_price ?? 0) })),
    };
  });

export const criarFornecedor = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ name: texto() }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_manage_suppliers");
    const { error } = await context.db.from("suppliers").insert({ name: data.name, owner_id: context.usuario.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editarFornecedor = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ id: uuid, name: texto() }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_manage_suppliers");
    const { error } = await context.db.from("suppliers").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirFornecedor = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    const { error } = await context.db.from("suppliers").delete().eq("id", data.id);
    if (error) {
      // O gatilho preserve_supplier_history recusa fornecedor com tipos.
      if (String(error.message).includes("tipos de marmita")) {
        throw new Error("Este fornecedor tem tipos de marmita. Arquive os tipos antes de excluir.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

const dinheiro = z.number().min(0).max(10000);
const dadosTipo = z.object({
  name: texto(),
  price: dinheiro,
  company_price: dinheiro,
  key: z.string().trim().max(60).regex(/^[a-z0-9_]*$/, "Chave inválida").optional(),
});

const chaveDe = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function erroDeChave(error: any): never {
  if (error?.code === "23505") throw new Error("Já existe uma marmita com essa chave de integração");
  throw new Error(error?.message ?? "Erro ao salvar");
}

export const criarTipo = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => dadosTipo.extend({ supplier_id: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_manage_suppliers");
    const { error } = await context.db.from("meal_types").insert({
      owner_id: context.usuario.id,
      supplier_id: data.supplier_id,
      name: data.name,
      price: data.price,
      company_price: data.company_price,
      key: chaveDe(data.key || data.name) || null,
    });
    if (error) erroDeChave(error);
    return { ok: true };
  });

export const editarTipo = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => dadosTipo.extend({ id: uuid }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_manage_suppliers");
    const { error } = await context.db
      .from("meal_types")
      .update({ name: data.name, price: data.price, company_price: data.company_price, key: chaveDe(data.key || data.name) || null })
      .eq("id", data.id);
    if (error) erroDeChave(error);
    return { ok: true };
  });

export const arquivarTipo = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    const { error } = await context.db.from("meal_types").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Registrar retirada (funcionário + marmita + assinatura)
// ---------------------------------------------------------------------------
export const podeLancarEmOutraData = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .handler(async ({ context }) => temPermissao(context, "can_backdate_records"));

// Assinatura: PNG em base64 (data URL), até ~1,5 MB — a do quadro tem 20-60 KB.
const assinaturaPNG = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Assinatura inválida");

export const registrarRetirada = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) =>
    z.object({ employee_id: uuid, meal_type_id: uuid, assinatura: assinaturaPNG, taken_at: iso.optional() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { db, usuario } = context;
    if (data.taken_at) await exigirPermissao(context, "can_backdate_records");

    const [{ data: tipo }, { data: func }] = await Promise.all([
      db.from("meal_types").select("id,price,company_price").eq("id", data.meal_type_id).is("archived_at", null).maybeSingle(),
      db.from("employees").select("id").eq("id", data.employee_id).is("archived_at", null).maybeSingle(),
    ]);
    if (!tipo) throw new Error("Tipo de marmita não encontrado");
    if (!func) throw new Error("Funcionário não encontrado");

    const bytes = Uint8Array.from(atob(data.assinatura.split(",")[1]), (c) => c.charCodeAt(0));
    // Confere a assinatura PNG (8 bytes mágicos): o tipo declarado não basta.
    const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!PNG.every((b, i) => bytes[i] === b)) throw new Error("Assinatura inválida");

    const caminho = `${usuario.id}/${Date.now()}-${data.employee_id}.png`;
    const { error: errUp } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: "image/png" });
    if (errUp) throw new Error("Falha ao salvar a assinatura");

    const { error } = await db.from("meal_records").insert({
      owner_id: usuario.id,
      employee_id: data.employee_id,
      meal_type_id: tipo.id,
      photo_path: caminho,
      unit_price: tipo.price,
      company_unit_price: tipo.company_price,
      ...(data.taken_at ? { taken_at: data.taken_at } : {}),
    });
    if (error) {
      await db.storage.from(BUCKET).remove([caminho]);
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Lançamentos de um funcionário (histórico do mês, com as assinaturas)
// ---------------------------------------------------------------------------
export const lancamentosDoFuncionario = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ id: uuid, inicio: iso, fim: iso }).parse(i))
  .handler(async ({ context: { db }, data }) => {
    const linhas = await todas((de, ate) =>
      db
        .from("meal_records")
        .select("id,taken_at,photo_path,meal_type_id,unit_price,meal_types(name,price,suppliers(name))")
        .eq("employee_id", data.id)
        .gte("taken_at", data.inicio)
        .lt("taken_at", data.fim)
        .order("taken_at", { ascending: false })
        .range(de, ate),
    );
    const urls = await urlsAssinadas(db, linhas.map((r: any) => r.photo_path));
    return linhas.map((r: any) => ({ ...r, photoUrl: urls[r.photo_path] ?? null }));
  });

export const editarLancamento = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ id: uuid, meal_type_id: uuid, taken_at: iso.optional() }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirPermissao(context, "can_edit_records");
    const { data: tipo } = await context.db
      .from("meal_types")
      .select("id,price,company_price")
      .eq("id", data.meal_type_id)
      .maybeSingle();
    if (!tipo) throw new Error("Tipo de marmita não encontrado");
    const { error } = await context.db
      .from("meal_records")
      .update({
        meal_type_id: tipo.id,
        unit_price: tipo.price,
        company_unit_price: tipo.company_price,
        ...(data.taken_at ? { taken_at: data.taken_at } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirLancamento = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .inputValidator((i) => z.object({ id: uuid, senha: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    const { data: apagados, error } = await context.db.from("meal_records").delete().eq("id", data.id).select("photo_path");
    if (error) throw new Error(error.message);
    const caminho = apagados?.[0]?.photo_path;
    if (caminho) await context.db.storage.from(BUCKET).remove([caminho]);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Relatório e marmitas por dia
// ---------------------------------------------------------------------------
export const relatorio = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ inicio: iso, fim: iso }).parse(i))
  .handler(async ({ context: { db }, data }) => {
    const [funcionarios, fornecedores, tipos, lancamentos] = await Promise.all([
      todas((de, ate) => db.from("employees_view").select("id,name,cpf,company,sector").range(de, ate)),
      todas((de, ate) => db.from("suppliers").select("id,name").range(de, ate)),
      todas((de, ate) => db.from("meal_types").select("id,supplier_id,name,price,company_price").range(de, ate)),
      todas((de, ate) =>
        db
          .from("meal_records")
          .select("id,employee_id,meal_type_id,photo_path,taken_at,unit_price,company_unit_price")
          .gte("taken_at", data.inicio)
          .lt("taken_at", data.fim)
          .order("taken_at", { ascending: false })
          .order("id", { ascending: false })
          .range(de, ate),
      ),
    ]);
    const porId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
    const f = porId(funcionarios as any[]);
    const s = porId(fornecedores as any[]);
    const t = porId(tipos as any[]);

    const linhas = [];
    for (const r of lancamentos as any[]) {
      const emp: any = f.get(r.employee_id);
      if (!emp) continue;
      const mt: any = r.meal_type_id ? t.get(r.meal_type_id) : null;
      const sup: any = mt ? s.get(mt.supplier_id) : null;
      linhas.push({
        id: r.id,
        employee_id: emp.id,
        name: emp.name,
        cpf: emp.cpf ?? null,
        company: emp.company ?? null,
        sector: emp.sector ?? null,
        supplier: sup?.name ?? "—",
        meal: mt?.name ?? "(não informada)",
        price: r.unit_price != null ? Number(r.unit_price) : mt ? Number(mt.price) : 0,
        company_price: r.company_unit_price != null ? Number(r.company_unit_price) : mt ? Number(mt.company_price) : 0,
        taken_at: r.taken_at,
        photo_path: r.photo_path ?? null,
      });
    }

    // Na tela aparece só a primeira assinatura de cada funcionário.
    const primeira = new Map<string, string>();
    for (const l of linhas) if (l.photo_path && !primeira.has(l.employee_id)) primeira.set(l.employee_id, l.photo_path);
    const urls = await urlsAssinadas(db, [...primeira.values()]);
    const assinaturas: Record<string, string> = {};
    for (const [emp, caminho] of primeira) if (urls[caminho]) assinaturas[emp] = urls[caminho];

    return { linhas, assinaturas };
  });

// Para o Excel (uma imagem por linha). Só devolve URL de caminho que é de fato
// de um lançamento — não é um "gerador de links" para o bucket inteiro.
export const urlsDasAssinaturas = createServerFn({ method: "POST" })
  .middleware([comSessao])
  .inputValidator((i) =>
    z.object({ caminhos: z.array(z.string().max(200).regex(/^[\w-]+\/[\w.-]+$/)).max(20000) }).parse(i),
  )
  .handler(async ({ context: { db }, data }) => {
    const unicos = [...new Set(data.caminhos)];
    const validos: string[] = [];
    for (let i = 0; i < unicos.length; i += 200) {
      const { data: linhas } = await db.from("meal_records").select("photo_path").in("photo_path", unicos.slice(i, i + 200));
      for (const l of linhas ?? []) validos.push(l.photo_path);
    }
    return urlsAssinadas(db, validos);
  });

export const marmitasPorDia = createServerFn({ method: "GET" })
  .middleware([comSessao])
  .inputValidator((i) => z.object({ inicio: iso, fim: iso }).parse(i))
  .handler(async ({ context: { db }, data }) =>
    todas((de, ate) =>
      db
        .from("meal_records")
        .select(
          "id, employee_id, meal_type_id, taken_at, unit_price, company_unit_price, employees(name), meal_types(name, price, company_price)",
        )
        .gte("taken_at", data.inicio)
        .lte("taken_at", data.fim)
        .order("taken_at", { ascending: true })
        .range(de, ate),
    ),
  );
