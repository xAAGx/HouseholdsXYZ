export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
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
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chore_completions: {
        Row: {
          chore_id: string
          completed_by: string
          created_at: string
          household_id: string
          id: string
          period_start: string
          points: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database['public']['Enums']['chore_completion_status']
        }
        Insert: {
          chore_id: string
          completed_by: string
          created_at?: string
          household_id: string
          id?: string
          period_start: string
          points: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: Database['public']['Enums']['chore_completion_status']
        }
        Update: {
          chore_id?: string
          completed_by?: string
          created_at?: string
          household_id?: string
          id?: string
          period_start?: string
          points?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['chore_completion_status']
        }
        Relationships: [
          {
            foreignKeyName: 'chore_completions_chore_id_household_id_fkey'
            columns: ['chore_id', 'household_id']
            isOneToOne: false
            referencedRelation: 'chores'
            referencedColumns: ['id', 'household_id']
          },
          {
            foreignKeyName: 'chore_completions_completed_by_fkey'
            columns: ['completed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chore_completions_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chores: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          due_on: string | null
          household_id: string
          id: string
          needs_approval: boolean
          notes: string | null
          points: number
          repeat: Database['public']['Enums']['chore_repeat']
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          household_id: string
          id?: string
          needs_approval?: boolean
          notes?: string | null
          points?: number
          repeat?: Database['public']['Enums']['chore_repeat']
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          household_id?: string
          id?: string
          needs_approval?: boolean
          notes?: string | null
          points?: number
          repeat?: Database['public']['Enums']['chore_repeat']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chores_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chores_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chores_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
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
      household_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          role: Database['public']['Enums']['household_role']
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id: string
          id?: string
          role: Database['public']['Enums']['household_role']
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          role?: Database['public']['Enums']['household_role']
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_invites_accepted_by_fkey'
            columns: ['accepted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_invites_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_invites_household_id_fkey'
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
          slug_key?: string | null
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
          slug_key?: string | null
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
      list_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          due_on: string | null
          household_id: string
          id: string
          list_id: string
          note: string | null
          position: number
          quantity: string | null
          text: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          household_id: string
          id?: string
          list_id: string
          note?: string | null
          position: number
          quantity?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          household_id?: string
          id?: string
          list_id?: string
          note?: string | null
          position?: number
          quantity?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'list_items_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_done_by_fkey'
            columns: ['done_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_list_id_household_id_fkey'
            columns: ['list_id', 'household_id']
            isOneToOne: false
            referencedRelation: 'lists'
            referencedColumns: ['id', 'household_id']
          },
        ]
      }
      list_members: {
        Row: {
          list_id: string
          profile_id: string
        }
        Insert: {
          list_id: string
          profile_id: string
        }
        Update: {
          list_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'list_members_list_id_fkey'
            columns: ['list_id']
            isOneToOne: false
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      lists: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: Database['public']['Enums']['list_kind']
          title: string
          updated_at: string
          visibility: Database['public']['Enums']['content_visibility']
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          kind?: Database['public']['Enums']['list_kind']
          title: string
          updated_at?: string
          visibility?: Database['public']['Enums']['content_visibility']
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: Database['public']['Enums']['list_kind']
          title?: string
          updated_at?: string
          visibility?: Database['public']['Enums']['content_visibility']
        }
        Relationships: [
          {
            foreignKeyName: 'lists_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lists_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      points_ledger: {
        Row: {
          chore_completion_id: string | null
          created_at: string
          created_by: string | null
          delta: number
          household_id: string
          id: number
          note: string | null
          profile_id: string
          reason: Database['public']['Enums']['points_reason']
          redemption_id: string | null
        }
        Insert: {
          chore_completion_id?: string | null
          created_at?: string
          created_by?: string | null
          delta: number
          household_id: string
          id?: never
          note?: string | null
          profile_id: string
          reason: Database['public']['Enums']['points_reason']
          redemption_id?: string | null
        }
        Update: {
          chore_completion_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: number
          household_id?: string
          id?: never
          note?: string | null
          profile_id?: string
          reason?: Database['public']['Enums']['points_reason']
          redemption_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'points_ledger_chore_completion_id_fkey'
            columns: ['chore_completion_id']
            isOneToOne: false
            referencedRelation: 'chore_completions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'points_ledger_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'points_ledger_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'points_ledger_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'points_ledger_redemption_id_fkey'
            columns: ['redemption_id']
            isOneToOne: false
            referencedRelation: 'reward_redemptions'
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
      reward_redemptions: {
        Row: {
          cost: number
          created_at: string
          household_id: string
          id: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reward_id: string
          status: Database['public']['Enums']['redemption_status']
        }
        Insert: {
          cost: number
          created_at?: string
          household_id: string
          id?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_id: string
          status?: Database['public']['Enums']['redemption_status']
        }
        Update: {
          cost?: number
          created_at?: string
          household_id?: string
          id?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_id?: string
          status?: Database['public']['Enums']['redemption_status']
        }
        Relationships: [
          {
            foreignKeyName: 'reward_redemptions_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reward_redemptions_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reward_redemptions_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reward_redemptions_reward_id_household_id_fkey'
            columns: ['reward_id', 'household_id']
            isOneToOne: false
            referencedRelation: 'rewards'
            referencedColumns: ['id', 'household_id']
          },
        ]
      }
      rewards: {
        Row: {
          archived_at: string | null
          cost: number
          created_at: string
          created_by: string | null
          description: string | null
          household_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cost: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rewards_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rewards_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_household_invite: { Args: { p_token: string }; Returns: string }
      account_deletion_blockers: {
        Args: never
        Returns: { household_id: string; household_name: string; other_members: number }[]
      }
      adjust_points: {
        Args: { p_delta: number; p_household_id: string; p_note: string; p_profile_id: string }
        Returns: undefined
      }
      begin_child_account: {
        Args: {
          p_display_name: string
          p_household_id: string
          p_parent_id: string
        }
        Returns: string
      }
      can_manage_child: {
        Args: { p_child_id: string; p_household_id: string }
        Returns: boolean
      }
      cancel_reward_redemption: { Args: { p_redemption_id: string }; Returns: undefined }
      complete_chore: {
        Args: { p_chore_id: string; p_today: string }
        Returns: {
          completion_id: string
          completion_status: Database['public']['Enums']['chore_completion_status']
        }[]
      }
      create_child_sign_in_code: {
        Args: { p_child_id: string; p_household_id: string }
        Returns: {
          code_expires_at: string
          sign_in_code: string
        }[]
      }
      create_household: {
        Args: { p_city_id: number; p_name: string; p_slug: string }
        Returns: string
      }
      create_household_invite: {
        Args: {
          p_household_id: string
          p_role: Database['public']['Enums']['household_role']
        }
        Returns: {
          invite_expires_at: string
          invite_id: string
          invite_token: string
        }[]
      }
      get_household_invite: {
        Args: { p_token: string }
        Returns: {
          already_member: boolean
          city_name: string
          country_code: string
          household_name: string
          invite_expires_at: string
          invite_role: Database['public']['Enums']['household_role']
          invited_by: string
          region_name: string
        }[]
      }
      household_points: {
        Args: { p_household_id: string }
        Returns: { balance: number; profile_id: string }[]
      }
      my_household_permissions: {
        Args: { p_household_id: string }
        Returns: Database['public']['Enums']['household_permission'][]
      }
      prepare_account_deletion: { Args: never; Returns: undefined }
      redeem_child_sign_in_code: { Args: { p_code: string }; Returns: string }
      reorder_list_items: { Args: { p_item_ids: string[]; p_list_id: string }; Returns: undefined }
      request_reward: { Args: { p_reward_id: string }; Returns: string }
      resolve_household_address: {
        Args: {
          p_city: string
          p_country: string
          p_name: string
          p_region: string
        }
        Returns: {
          household_id: string
          is_current: boolean
        }[]
      }
      review_chore_completion: {
        Args: { p_approve: boolean; p_completion_id: string }
        Returns: undefined
      }
      review_reward_redemption: {
        Args: { p_approve: boolean; p_redemption_id: string }
        Returns: undefined
      }
      set_household_member_role: {
        Args: {
          p_household_id: string
          p_profile_id: string
          p_role: Database['public']['Enums']['household_role']
        }
        Returns: undefined
      }
      set_list_members: { Args: { p_list_id: string; p_profile_ids: string[] }; Returns: undefined }
      transfer_household_ownership: {
        Args: { p_household_id: string; p_new_owner_id: string }
        Returns: undefined
      }
      undo_chore_completion: { Args: { p_completion_id: string }; Returns: undefined }
    }
    Enums: {
      account_type: 'standard' | 'child'
      chore_completion_status: 'pending' | 'approved' | 'rejected'
      chore_repeat: 'once' | 'daily' | 'weekly' | 'monthly'
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
      list_kind: 'todo' | 'shopping' | 'packing' | 'other'
      membership_status: 'invited' | 'active' | 'suspended'
      points_reason: 'chore' | 'reward' | 'adjustment'
      redemption_status: 'requested' | 'approved' | 'rejected' | 'cancelled'
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ['standard', 'child'],
      chore_completion_status: ['pending', 'approved', 'rejected'],
      chore_repeat: ['once', 'daily', 'weekly', 'monthly'],
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
      list_kind: ['todo', 'shopping', 'packing', 'other'],
      membership_status: ['invited', 'active', 'suspended'],
      points_reason: ['chore', 'reward', 'adjustment'],
      redemption_status: ['requested', 'approved', 'rejected', 'cancelled'],
    },
  },
} as const
