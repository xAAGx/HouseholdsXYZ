export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      account_details: {
        Row: {
          created_at: string
          date_of_birth: string
          phone: string
          phone_verified_at: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          phone: string
          phone_verified_at?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          phone?: string
          phone_verified_at?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'account_details_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      geo_cities: {
        Row: {
          ascii_name: string
          country_code: string
          district: string | null
          id: number
          name: string
          population: number
          region_id: string
          slug: string
        }
        Insert: {
          ascii_name: string
          country_code: string
          district?: string | null
          id: number
          name: string
          population?: number
          region_id: string
          slug: string
        }
        Update: {
          ascii_name?: string
          country_code?: string
          district?: string | null
          id?: number
          name?: string
          population?: number
          region_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'geo_cities_country_code_fkey'
            columns: ['country_code']
            isOneToOne: false
            referencedRelation: 'geo_countries'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'geo_cities_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'geo_regions'
            referencedColumns: ['id']
          },
        ]
      }
      geo_countries: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      geo_regions: {
        Row: {
          country_code: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          country_code: string
          id: string
          name: string
          slug: string
        }
        Update: {
          country_code?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'geo_regions_country_code_fkey'
            columns: ['country_code']
            isOneToOne: false
            referencedRelation: 'geo_countries'
            referencedColumns: ['code']
          },
        ]
      }
      household_address_history: {
        Row: {
          city_id: number
          created_at: string
          household_id: string
          id: number
          slug_key: string
        }
        Insert: {
          city_id: number
          created_at?: string
          household_id: string
          id?: never
          slug_key: string
        }
        Update: {
          city_id?: number
          created_at?: string
          household_id?: string
          id?: never
          slug_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_address_history_city_id_fkey'
            columns: ['city_id']
            isOneToOne: false
            referencedRelation: 'geo_cities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_address_history_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
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
          city_id: number | null
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
          city_id?: number | null
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
          city_id?: number | null
          cover_path?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          slug_key?: never
          updated_at?: string
          visibility?: Database['public']['Enums']['household_visibility']
        }
        Relationships: [
          {
            foreignKeyName: 'households_city_id_fkey'
            columns: ['city_id']
            isOneToOne: false
            referencedRelation: 'geo_cities'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database['public']['Enums']['account_type']
          avatar_path: string | null
          city_id: number | null
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          is_discoverable: boolean
          last_name: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database['public']['Enums']['account_type']
          avatar_path?: string | null
          city_id?: number | null
          created_at?: string
          display_name: string
          first_name?: string | null
          id: string
          is_discoverable?: boolean
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database['public']['Enums']['account_type']
          avatar_path?: string | null
          city_id?: number | null
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          is_discoverable?: boolean
          last_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_city_id_fkey'
            columns: ['city_id']
            isOneToOne: false
            referencedRelation: 'geo_cities'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: {
        Args: { p_city_id: number; p_name: string; p_slug: string }
        Returns: string
      }
      my_household_permissions: {
        Args: { p_household_id: string }
        Returns: Database['public']['Enums']['household_permission'][]
      }
      resolve_household_address: {
        Args: { p_city: string; p_country: string; p_name: string; p_region: string }
        Returns: { household_id: string; is_current: boolean }[]
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
