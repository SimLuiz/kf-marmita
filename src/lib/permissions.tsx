import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface AppPermissions {
  id: string;
  can_create_employees: boolean;
  can_edit_employees: boolean;
  can_manage_suppliers: boolean;
  can_edit_records: boolean;
  can_backdate_records: boolean;
}

export type PermissionKey = keyof Omit<AppPermissions, "id">;

export const PERMISSION_LABELS: { key: PermissionKey; label: string; help: string }[] = [
  {
    key: "can_create_employees",
    label: "Cadastrar funcionários",
    help: "Permite que o usuário comum cadastre novos funcionários.",
  },
  {
    key: "can_edit_employees",
    label: "Editar funcionários",
    help: "Permite alterar nome, CPF, empresa e setor de um funcionário.",
  },
  {
    key: "can_manage_suppliers",
    label: "Gerenciar fornecedores e marmitas",
    help: "Permite cadastrar e editar fornecedores, tipos de marmita e valores.",
  },
  {
    key: "can_edit_records",
    label: "Editar lançamentos",
    help: "Permite corrigir o tipo de marmita e a data de um registro já feito.",
  },
  {
    key: "can_backdate_records",
    label: "Lançar em outras datas",
    help: "Permite escolher data/hora passada ou futura ao registrar uma retirada.",
  },
];

const DEFAULTS: Omit<AppPermissions, "id"> = {
  can_create_employees: true,
  can_edit_employees: false,
  can_manage_suppliers: false,
  can_edit_records: false,
  can_backdate_records: false,
};

interface Ctx {
  permissions: AppPermissions | null;
  loading: boolean;
  reload: () => Promise<void>;
  can: (key: PermissionKey) => boolean;
}

const PermCtx = createContext<Ctx | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<AppPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setPermissions(null);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from("app_permissions")
      .select("*")
      .limit(1)
      .maybeSingle();
    setPermissions((data as AppPermissions) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const can = useCallback(
    (key: PermissionKey) => {
      if (isAdmin) return true;
      const source = permissions ?? DEFAULTS;
      return !!source[key];
    },
    [isAdmin, permissions]
  );

  return (
    <PermCtx.Provider value={{ permissions, loading, reload, can }}>{children}</PermCtx.Provider>
  );
}

export function usePermissions() {
  const v = useContext(PermCtx);
  if (!v) throw new Error("usePermissions must be used within PermissionsProvider");
  return v;
}
