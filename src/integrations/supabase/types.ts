export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_permissions: {
        Row: {
          can_backdate_records: boolean
          can_create_employees: boolean
          can_edit_employees: boolean
          can_edit_records: boolean
          can_manage_suppliers: boolean
          created_at: string
          id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          can_backdate_records?: boolean
          can_create_employees?: boolean
          can_edit_employees?: boolean
          can_edit_records?: boolean
          can_manage_suppliers?: boolean
          created_at?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          can_backdate_records?: boolean
          can_create_employees?: boolean
          can_edit_employees?: boolean
          can_edit_records?: boolean
          can_manage_suppliers?: boolean
          created_at?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          archived_at: string | null
          company: string | null
          cpf: string | null
          cpf_encrypted: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          sector: string | null
          vinculo: string
        }
        Insert: {
          archived_at?: string | null
          company?: string | null
          cpf?: string | null
          cpf_encrypted?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          sector?: string | null
          vinculo?: string
        }
        Update: {
          archived_at?: string | null
          company?: string | null
          cpf?: string | null
          cpf_encrypted?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          sector?: string | null
          vinculo?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip: string | null
          success: boolean
          user_agent: string | null
          username: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          username: string
        }
        Update: {
          attempted_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          username?: string
        }
        Relationships: []
      }
      meal_records: {
        Row: {
          company_unit_price: number | null
          created_at: string
          employee_id: string
          id: string
          meal_type_id: string | null
          owner_id: string
          photo_path: string
          taken_at: string
          unit_price: number | null
        }
        Insert: {
          company_unit_price?: number | null
          created_at?: string
          employee_id: string
          id?: string
          meal_type_id?: string | null
          owner_id: string
          photo_path: string
          taken_at?: string
          unit_price?: number | null
        }
        Update: {
          company_unit_price?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          meal_type_id?: string | null
          owner_id?: string
          photo_path?: string
          taken_at?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "meal_types"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_types: {
        Row: {
          archived_at: string | null
          company_price: number
          created_at: string
          id: string
          key: string | null
          name: string
          owner_id: string
          price: number
          supplier_id: string
        }
        Insert: {
          archived_at?: string | null
          company_price?: number
          created_at?: string
          id?: string
          key?: string | null
          name: string
          owner_id: string
          price?: number
          supplier_id: string
        }
        Update: {
          archived_at?: string | null
          company_price?: number
          created_at?: string
          id?: string
          key?: string | null
          name?: string
          owner_id?: string
          price?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_types_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          last_activity_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          last_activity_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          last_activity_at?: string
          username?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      employees_view: {
        Row: {
          archived_at: string | null
          company: string | null
          cpf: string | null
          created_at: string | null
          id: string | null
          name: string | null
          owner_id: string | null
          sector: string | null
          vinculo: string | null
        }
        Insert: {
          archived_at?: string | null
          company?: string | null
          cpf?: never
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          sector?: string | null
          vinculo?: string | null
        }
        Update: {
          archived_at?: string | null
          company?: string | null
          cpf?: never
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          sector?: string | null
          vinculo?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      app_perm: { Args: { _key: string }; Returns: boolean }
      check_login_lockout: {
        Args: { _ip: string; _username: string }
        Returns: {
          locked: boolean
          reason: string
          retry_after_seconds: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pg_database_size_current: { Args: never; Returns: number }
      public_table_sizes: {
        Args: never
        Returns: {
          name: string
          row_estimate: number
          total_bytes: number
        }[]
      }
      touch_and_check_idle: {
        Args: { _max_minutes: number }
        Returns: {
          expired: boolean
          idle_seconds: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
