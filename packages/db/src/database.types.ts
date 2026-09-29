export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      household_members: {
        Row: {
          created_at: string
          granted_permissions: Database['public']['Enums']['household_permission'][]
          household_id: string
          invited_by: string | null
          joined_at: string | null
          profile_id: string
          relationship_label: string | null
          revoked_permissions: Database['public']['Enums']['household_permission'][]
          role: Database['public']['Enums']['household_role']
          status: Database['public']['Enums']['membership_status']
          updated_at: string
        }
        Insert: {
          created_at?: string
          granted_permissions?: Database['public']['Enums']['household_permission'][]
          household_id: string
          invited_by?: string | null
          joined_at?: string | null
          profile_id: string
          relationship_label?: string | null
          revoked_permissions?: Database['public']['Enums']['household_permission'][]
          role: Database['public']['Enums']['household_role']
          status?: Database['public']['Enums']['membership_status']
          updated_at?: string
        }
        Update: {
          created_at?: string
          granted_permissions?: Database['public']['Enums']['household_permission'][]
          household_id?: string
          invited_by?: string | null
          joined_at?: string | null
          profile_id?: string
          relationship_label?: string | null
          revoked_permissions?: Database['public']['Enums']['household_permission'][]
          role?: Database['public']['Enums']['household_role']
          status?: Database['public']['Enums']['membership_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_members_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      household_role_permissions: {
        Row: {
          permission: Database['public']['Enums']['household_permission']
          role: Database['public']['Enums']['household_role']
        }
        Insert: {
          permission: Database['public']['Enums']['household_permission']
          role: Database['public']['Enums']['household_role']
        }
        Update: {
          permission?: Database['public']['Enums']['household_permission']
          role?: Database['public']['Enums']['household_role']
        }
        Relationships: []
      }
      households: {
        Row: {
          area: string | null
          avatar_path: string | null
          bio: string | null
          cover_path: string | null
          created_at: string
          id: string
          name: string
          slug: string
          slug_key: string | null
          updated_at: string
          visibility: Database['public']['Enums']['household_visibility']
        }
        Insert: {
          area?: string | null
          avatar_path?: string | null
          bio?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          slug_key?: never
          updated_at?: string
          visibility?: Database['public']['Enums']['household_visibility']
        }
        Update: {
          area?: string | null
          avatar_path?: string | null
          bio?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          slug_key?: never
          updated_at?: string
          visibility?: Database['public']['Enums']['household_visibility']
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database['public']['Enums']['account_type']
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          is_discoverable: boolean
          updated_at: string
        }
        Insert: {
          account_type?: Database['public']['Enums']['account_type']
          avatar_path?: string | null
          created_at?: string
          display_name: string
          id: string
          is_discoverable?: boolean
          updated_at?: string
        }
        Update: {
          account_type?: Database['public']['Enums']['account_type']
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_discoverable?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: { Args: { p_name: string; p_slug: string }; Returns: string }
      my_household_permissions: {
        Args: { p_household_id: string }
        Returns: Database['public']['Enums']['household_permission'][]
      }
    }
    Enums: {
      account_type: 'standard' | 'child'
      content_visibility:
        'private' | 'selected_members' | 'household' | 'connections' | 'neighborhood' | 'public'
      household_permission:
        | 'manage_household'
        | 'invite_members'
        | 'manage_members'
        | 'manage_children'
        | 'create_posts'
        | 'moderate_content'
        | 'publish_public'
        | 'view_expenses'
        | 'manage_expenses'
        | 'view_documents'
        | 'manage_documents'
        | 'manage_chores'
        | 'manage_calendar'
      household_role: 'owner' | 'admin' | 'adult' | 'teen' | 'child' | 'caregiver' | 'guest'
      household_visibility: 'private' | 'connections' | 'neighborhood' | 'public'
      membership_status: 'invited' | 'active' | 'suspended'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ['standard', 'child'],
      content_visibility: [
        'private',
        'selected_members',
        'household',
        'connections',
        'neighborhood',
        'public',
      ],
      household_permission: [
        'manage_household',
        'invite_members',
        'manage_members',
        'manage_children',
        'create_posts',
        'moderate_content',
        'publish_public',
        'view_expenses',
        'manage_expenses',
        'view_documents',
        'manage_documents',
        'manage_chores',
        'manage_calendar',
      ],
      household_role: ['owner', 'admin', 'adult', 'teen', 'child', 'caregiver', 'guest'],
      household_visibility: ['private', 'connections', 'neighborhood', 'public'],
      membership_status: ['invited', 'active', 'suspended'],
    },
  },
} as const
