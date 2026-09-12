import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedShell } from "@/components/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PERMISSION_LABELS, usePermissions, type PermissionKey } from "@/lib/permissions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/safe-error";
import { SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões do usuário | Marmita Control" },
      {
        name: "description",
        content: "Defina o que os usuários comuns podem editar dentro do controle de marmitas.",
      },
      { property: "og:title", content: "Permissões do usuário | Marmita Control" },
      {
        property: "og:description",
        content: "Defina o que os usuários comuns podem editar dentro do controle de marmitas.",
      },
    ],
  }),
  component: () => (
    <ProtectedShell>
      <Page />
    </ProtectedShell>
  ),
});

function Page() {
  const { isAdmin } = useAuth();
  const { permissions, loading, reload } = usePermissions();
  const [saving, setSaving] = useState<PermissionKey | null>(null);
  const [local, setLocal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (permissions) {
      const next: Record<string, boolean> = {};
      for (const { key } of PERMISSION_LABELS) next[key] = !!permissions[key];
      setLocal(next);
    }
  }, [permissions]);

  if (!isAdmin) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Apenas o administrador pode acessar esta área.
      </p>
    );
  }

  const toggle = async (key: PermissionKey, value: boolean) => {
    if (!permissions) return;
    setLocal((p) => ({ ...p, [key]: value }));
    setSaving(key);
    const { error } = await (supabase as any)
      .from("app_permissions")
      .update({ [key]: value })
      .eq("id", permissions.id);
    setSaving(null);
    if (error) {
      setLocal((p) => ({ ...p, [key]: !value }));
      return toast.error(toUserMessage(error));
    }
    toast.success("Permissão atualizada");
    reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SlidersHorizontal className="h-6 w-6 text-primary" /> Permissões
        </h2>
        <p className="text-sm text-muted-foreground">
          Escolha o que o usuário comum pode fazer no aplicativo. O admin sempre tem acesso total.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {PERMISSION_LABELS.map(({ key, label, help }) => (
            <div
              key={key}
              className="bg-card rounded-lg p-4 flex items-start gap-3"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{label}</div>
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
              <Switch
                checked={!!local[key]}
                disabled={saving === key}
                onCheckedChange={(v) => toggle(key, v)}
                aria-label={label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
