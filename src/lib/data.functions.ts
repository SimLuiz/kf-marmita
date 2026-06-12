// Server functions de dados — todas as operações CRUD usadas pelo frontend.
// Substituem chamadas diretas a `supabase.from(...)` do browser para que o JWT
// nunca precise existir client-side. Cada handler usa requireServerSession,
// que valida o cookie HttpOnly e atua com permissões do usuário (RLS aplica).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// -------- helpers --------

async function session() {
  const { requireServerSession } = await import("@/integrations/supabase/session.server");
  return requireServerSession();
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isAdminUser(userId: string) {
  const sb = await admin();
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

// =================== EMPLOYEES ===================

export const listEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const s = await session();
  const { data, error } = await (s.supabase as any)
    .from("employees_view")
    .select("id,name,cpf,company,created_at")
    .order("name");
  if (error) throw new Response(error.message, { status: 400 });
  return data ?? [];
});

export const getEmployee = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    const { data: row, error } = await (s.supabase as any)
      .from("employees_view")
      .select("id,name,cpf,company")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 400 });
    return row;
  });

export const createEmployee = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(100),
        cpf: z.string().max(20).nullable().optional(),
        company: z.string().max(100).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    const { error } = await s.supabase.from("employees").insert({
      name: data.name,
      cpf: data.cpf ?? null,
      company: data.company ?? null,
      owner_id: s.userId,
    } as any);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100),
        cpf: z.string().max(20).nullable().optional(),
        company: z.string().max(100).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    const { error } = await s.supabase
      .from("employees")
      .update({
        name: data.name,
        cpf: data.cpf ?? null,
        company: data.company ?? null,
      } as any)
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// =================== SUPPLIERS / MEAL TYPES ===================

export const listSuppliersAndTypes = createServerFn({ method: "GET" }).handler(async () => {
  const s = await session();
  const [{ data: sups, error: e1 }, { data: mts, error: e2 }] = await Promise.all([
    s.supabase.from("suppliers").select("id,name").order("name"),
    s.supabase.from("meal_types").select("id,supplier_id,name,price").order("name"),
  ]);
  if (e1) throw new Response(e1.message, { status: 400 });
  if (e2) throw new Response(e2.message, { status: 400 });
  return {
    suppliers: sups ?? [],
    mealTypes: (mts ?? []).map((t: any) => ({ ...t, price: Number(t.price) })),
  };
});

export const createSupplier = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ name: z.string().min(1).max(100) }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase
      .from("suppliers")
      .insert({ name: data.name, owner_id: s.userId } as any);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const updateSupplier = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(100) }).parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase
      .from("suppliers")
      .update({ name: data.name } as any)
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const createMealType = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        supplier_id: z.string().uuid(),
        name: z.string().min(1).max(100),
        price: z.number().min(0).max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase.from("meal_types").insert({
      supplier_id: data.supplier_id,
      name: data.name,
      price: data.price,
      owner_id: s.userId,
    } as any);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const updateMealType = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100),
        price: z.number().min(0).max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase
      .from("meal_types")
      .update({ name: data.name, price: data.price } as any)
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const deleteMealType = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    const { error } = await s.supabase.from("meal_types").delete().eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// =================== MEAL RECORDS ===================

export const listEmployeeRecords = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        employee_id: z.string().uuid(),
        start_iso: z.string(),
        end_iso: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    const { data: rows, error } = await s.supabase
      .from("meal_records")
      .select(
        "id,taken_at,photo_path,meal_type_id,unit_price,meal_types(name,price,suppliers(name))",
      )
      .eq("employee_id", data.employee_id)
      .gte("taken_at", data.start_iso)
      .lt("taken_at", data.end_iso)
      .order("taken_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });

    // Inclui signed URLs para fotos (rodam server-side com service role)
    const sbAdmin = await admin();
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: signed } = await sbAdmin.storage
          .from("meal-photos")
          .createSignedUrl(r.photo_path, 60 * 60);
        return { ...r, photoUrl: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const listReportRecords = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ start_iso: z.string(), end_iso: z.string() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    const [emps, sups, mts, recs] = await Promise.all([
      (s.supabase as any).from("employees_view").select("id,name,cpf,company"),
      s.supabase.from("suppliers").select("id,name"),
      s.supabase.from("meal_types").select("id,supplier_id,name,price"),
      s.supabase
        .from("meal_records")
        .select("id,employee_id,meal_type_id,photo_path,taken_at,unit_price")
        .gte("taken_at", data.start_iso)
        .lt("taken_at", data.end_iso)
        .order("taken_at", { ascending: false }),
    ]);

    // Pega assinaturas (uma por funcionário) com signed URL server-side
    const sbAdmin = await admin();
    const sigPaths = new Map<string, string>();
    for (const r of (recs.data ?? []) as any[]) {
      if (r.photo_path && !sigPaths.has(r.employee_id)) {
        sigPaths.set(r.employee_id, r.photo_path);
      }
    }
    const sigUrls: Record<string, string> = {};
    await Promise.all(
      Array.from(sigPaths.entries()).map(async ([empId, path]) => {
        const { data: signed } = await sbAdmin.storage
          .from("meal-photos")
          .createSignedUrl(path, 60 * 60 * 24);
        if (signed?.signedUrl) sigUrls[empId] = signed.signedUrl;
      }),
    );

    return {
      employees: emps.data ?? [],
      suppliers: sups.data ?? [],
      mealTypes: (mts.data ?? []).map((t: any) => ({ ...t, price: Number(t.price) })),
      records: recs.data ?? [],
      sigUrls,
    };
  });

export const deleteMealRecord = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const s = await session();
    if (!(await isAdminUser(s.userId))) throw new Response("Forbidden", { status: 403 });
    // Busca foto antes de deletar
    const { data: row } = await s.supabase
      .from("meal_records")
      .select("photo_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await s.supabase.from("meal_records").delete().eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    if ((row as any)?.photo_path) {
      const sbAdmin = await admin();
      await sbAdmin.storage.from("meal-photos").remove([(row as any).photo_path]);
    }
    return { ok: true };
  });

// Upload de assinatura: o blob viaja como base64 (assinaturas são pequenas, < 50KB)
export const uploadMealSignature = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        employee_id: z.string().uuid(),
        meal_type_id: z.string().uuid(),
        unit_price: z.number().min(0).max(10000),
        png_base64: z.string().min(1).max(2_000_000), // ~1.5MB de PNG bruto
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = await session();
    const sbAdmin = await admin();
    // Decodifica base64 server-side
    const bin = Buffer.from(data.png_base64, "base64");
    if (bin.length === 0) throw new Response("Empty image", { status: 400 });
    const path = `${s.userId}/${Date.now()}-${data.employee_id}.png`;
    const { error: upErr } = await sbAdmin.storage
      .from("meal-photos")
      .upload(path, bin, { contentType: "image/png" });
    if (upErr) throw new Response(upErr.message, { status: 400 });

    const { error: insErr } = await s.supabase.from("meal_records").insert({
      owner_id: s.userId,
      employee_id: data.employee_id,
      meal_type_id: data.meal_type_id,
      photo_path: path,
      unit_price: data.unit_price,
    } as any);
    if (insErr) {
      await sbAdmin.storage.from("meal-photos").remove([path]);
      throw new Response(insErr.message, { status: 400 });
    }
    return { ok: true };
  });
