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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_project_checkpoints: {
        Row: {
          created_at: string
          files: Json
          id: string
          is_bookmarked: boolean
          name: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          files: Json
          id?: string
          is_bookmarked?: boolean
          name?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          files?: Json
          id?: string
          is_bookmarked?: boolean
          name?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_checkpoints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_file_staging: {
        Row: {
          content: string
          created_at: string
          file_path: string
          import_id: string
          project_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_path: string
          import_id: string
          project_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_path?: string
          import_id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_file_staging_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_files: {
        Row: {
          byte_size: number | null
          content: string
          file_path: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          byte_size?: number | null
          content?: string
          file_path: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          byte_size?: number | null
          content?: string
          file_path?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_runs: {
        Row: {
          created_at: string
          error_message: string | null
          exit_code: number | null
          finished_at: string | null
          id: string
          project_id: string
          run_type: string
          started_at: string
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          project_id: string
          run_type: string
          started_at?: string
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          project_id?: string
          run_type?: string
          started_at?: string
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          created_at: string
          default_branch: string
          deployment_url: string | null
          description: string
          file_storage_ready_at: string | null
          files: Json
          framework: string
          github_repo: string | null
          id: string
          last_build_at: string | null
          last_build_status: string
          messages: Json
          name: string
          published: boolean
          repository_url: string | null
          slug: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          workspace_settings: Json
        }
        Insert: {
          created_at?: string
          default_branch?: string
          deployment_url?: string | null
          description?: string
          file_storage_ready_at?: string | null
          files?: Json
          framework?: string
          github_repo?: string | null
          id?: string
          last_build_at?: string | null
          last_build_status?: string
          messages?: Json
          name?: string
          published?: boolean
          repository_url?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          workspace_settings?: Json
        }
        Update: {
          created_at?: string
          default_branch?: string
          deployment_url?: string | null
          description?: string
          file_storage_ready_at?: string | null
          files?: Json
          framework?: string
          github_repo?: string | null
          id?: string
          last_build_at?: string | null
          last_build_status?: string
          messages?: Json
          name?: string
          published?: boolean
          repository_url?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          workspace_settings?: Json
        }
        Relationships: []
      }
      agent_prompt_templates: {
        Row: {
          category: string
          created_at: string
          id: string
          is_favorite: boolean
          prompt: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          prompt: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          reference_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_snippets: {
        Row: {
          code: string
          created_at: string
          id: string
          language: string
          prompt: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          language?: string
          prompt?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          language?: string
          prompt?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_request_usage: {
        Row: {
          created_at: string
          duration_ms: number
          endpoint: string
          id: string
          method: string
          request_bytes: number
          response_bytes: number
          service: string
          status_code: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          endpoint: string
          id?: string
          method: string
          request_bytes?: number
          response_bytes?: number
          service: string
          status_code: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          endpoint?: string
          id?: string
          method?: string
          request_bytes?: number
          response_bytes?: number
          service?: string
          status_code?: number
          user_id?: string
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          created_at: string
          event: string
          id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_events_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link_url: string | null
          media_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link_url?: string | null
          media_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link_url?: string | null
          media_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_stories: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          sender_email: string
          sender_name: string
          subject: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          sender_email: string
          sender_name: string
          subject: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          sender_email?: string
          sender_name?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          details: string
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          details?: string
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      cpa_conversions: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          offer_id: string | null
          provider: string
          provider_event_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_credits: number
          status: string
          tracking_id: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          offer_id?: string | null
          provider?: string
          provider_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_credits: number
          status?: string
          tracking_id: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          offer_id?: string | null
          provider?: string
          provider_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_credits?: number
          status?: string
          tracking_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpa_conversions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "cpa_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      cpa_offers: {
        Row: {
          category: string
          created_at: string
          description: string
          destination_url: string
          id: string
          instructions: string
          is_active: boolean
          is_featured: boolean
          provider: string
          reward_credits: number
          sort_order: number
          title: string
          tracking_parameter: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          destination_url: string
          id?: string
          instructions?: string
          is_active?: boolean
          is_featured?: boolean
          provider?: string
          reward_credits?: number
          sort_order?: number
          title: string
          tracking_parameter?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          destination_url?: string
          id?: string
          instructions?: string
          is_active?: boolean
          is_featured?: boolean
          provider?: string
          reward_credits?: number
          sort_order?: number
          title?: string
          tracking_parameter?: string
          updated_at?: string
        }
        Relationships: []
      }
      developer_vault_items: {
        Row: {
          created_at: string
          file_name: string
          group_id: string
          group_kind: string
          group_name: string
          id: string
          mime_type: string | null
          relative_path: string
          size_bytes: number
          storage_path: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          group_id: string
          group_kind: string
          group_name: string
          id?: string
          mime_type?: string | null
          relative_path: string
          size_bytes?: number
          storage_path: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          group_id?: string
          group_kind?: string
          group_name?: string
          id?: string
          mime_type?: string | null
          relative_path?: string
          size_bytes?: number
          storage_path?: string
          uploader_id?: string
        }
        Relationships: []
      }
      direct_call_signals: {
        Row: {
          conversation_id: string
          created_at: string
          from_user_id: string
          id: string
          payload: Json
          signal_type: string
          to_user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_user_id: string
          id?: string
          payload?: Json
          signal_type: string
          to_user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_user_id?: string
          id?: string
          payload?: Json
          signal_type?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_call_signals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversation_hidden: {
        Row: {
          conversation_id: string
          hidden_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          hidden_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          hidden_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversation_hidden_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          pair_key: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          pair_key: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          pair_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          media_path: string | null
          sender_id: string
        }
        Insert: {
          body?: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          media_path?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          media_path?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          category: string
          created_at: string
          description: string | null
          downloads: number
          file_name: string
          id: string
          mime_type: string | null
          payout_account: string | null
          price: number
          size_bytes: number
          source_url: string | null
          storage_path: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          downloads?: number
          file_name: string
          id?: string
          mime_type?: string | null
          payout_account?: string | null
          price?: number
          size_bytes?: number
          source_url?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          downloads?: number
          file_name?: string
          id?: string
          mime_type?: string | null
          payout_account?: string | null
          price?: number
          size_bytes?: number
          source_url?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_links: {
        Row: {
          active: boolean
          ai_credits: number
          bonus_bytes: number
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          max_uses: number
          uses: number
        }
        Insert: {
          active?: boolean
          ai_credits?: number
          bonus_bytes?: number
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          max_uses?: number
          uses?: number
        }
        Update: {
          active?: boolean
          ai_credits?: number
          bonus_bytes?: number
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          max_uses?: number
          uses?: number
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          created_at: string
          id: string
          invite_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_vault_files: {
        Row: {
          created_at: string
          entry_type: string
          file_name: string
          file_url: string | null
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_type?: string
          file_name: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entry_type?: string
          file_name?: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_credits: number
          ai_subscribed: boolean
          ai_subscription_expires_at: string | null
          avatar_url: string | null
          bio: string | null
          bonus_bytes: number
          created_at: string
          display_name: string | null
          id: string
          is_subscribed: boolean
          storage_quota_bytes: number
          theme: string
          updated_at: string
          username: string
        }
        Insert: {
          ai_credits?: number
          ai_subscribed?: boolean
          ai_subscription_expires_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          bonus_bytes?: number
          created_at?: string
          display_name?: string | null
          id: string
          is_subscribed?: boolean
          storage_quota_bytes?: number
          theme?: string
          updated_at?: string
          username: string
        }
        Update: {
          ai_credits?: number
          ai_subscribed?: boolean
          ai_subscription_expires_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          bonus_bytes?: number
          created_at?: string
          display_name?: string | null
          id?: string
          is_subscribed?: boolean
          storage_quota_bytes?: number
          theme?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      project_requests: {
        Row: {
          admin_note: string | null
          contact: string | null
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          skills: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          skills?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          skills?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_requests_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      "public.community_posts": {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          ad_settings: Json
          ai_free_credits: number
          ai_subscription_credits: number
          ai_subscription_price: number
          error_dialog_enabled: boolean
          id: number
          instagram_url: string
          logo_url: string | null
          owner_email: string
          payout_account: string | null
          site_branding_settings: Json
          site_name: string
          subscription_price: number
          subscription_quota_bytes: number
          tagline: string
          updated_at: string
          youtube_url: string
        }
        Insert: {
          ad_settings?: Json
          ai_free_credits?: number
          ai_subscription_credits?: number
          ai_subscription_price?: number
          error_dialog_enabled?: boolean
          id?: number
          instagram_url?: string
          logo_url?: string | null
          owner_email?: string
          payout_account?: string | null
          site_branding_settings?: Json
          site_name?: string
          subscription_price?: number
          subscription_quota_bytes?: number
          tagline?: string
          updated_at?: string
          youtube_url?: string
        }
        Update: {
          ad_settings?: Json
          ai_free_credits?: number
          ai_subscription_credits?: number
          ai_subscription_price?: number
          error_dialog_enabled?: boolean
          id?: number
          instagram_url?: string
          logo_url?: string | null
          owner_email?: string
          payout_account?: string | null
          site_branding_settings?: Json
          site_name?: string
          subscription_price?: number
          subscription_quota_bytes?: number
          tagline?: string
          updated_at?: string
          youtube_url?: string
        }
        Relationships: []
      }
      software_requests: {
        Row: {
          admin_note: string | null
          budget: string | null
          business_name: string | null
          contact_method: string | null
          created_at: string
          description: string
          email: string
          full_name: string
          id: string
          project_type: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          budget?: string | null
          business_name?: string | null
          contact_method?: string | null
          created_at?: string
          description: string
          email: string
          full_name: string
          id?: string
          project_type: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          budget?: string | null
          business_name?: string | null
          contact_method?: string | null
          created_at?: string
          description?: string
          email?: string
          full_name?: string
          id?: string
          project_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          method: string
          note: string | null
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          reference: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          link: string | null
          name: string
          phone: string | null
          role: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          link?: string | null
          name: string
          phone?: string | null
          role?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          link?: string | null
          name?: string
          phone?: string | null
          role?: string
          sort_order?: number
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
      video_view_events: {
        Row: {
          created_at: string
          video_id: string
          viewed_on: string
          viewer_key: string
        }
        Insert: {
          created_at?: string
          video_id: string
          viewed_on?: string
          viewer_key: string
        }
        Update: {
          created_at?: string
          video_id?: string
          viewed_on?: string
          viewer_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_view_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          player_alignment: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          views: number
          youtube_id: string
          youtube_url: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          player_alignment?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
          views?: number
          youtube_id: string
          youtube_url: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          player_alignment?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
          youtube_id?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_groups: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          media_mime_type: string | null
          media_path: string | null
          media_size_bytes: number
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          media_mime_type?: string | null
          media_path?: string | null
          media_size_bytes?: number
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          media_mime_type?: string | null
          media_path?: string | null
          media_size_bytes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_api_usage_summary: {
        Args: { p_since?: string }
        Returns: {
          average_duration_ms: number
          endpoint: string
          error_count: number
          last_seen: string
          method: string
          request_count: number
          service: string
        }[]
      }
      admin_review_cpa_conversion: {
        Args: { p_approve: boolean; p_conversion_id: string; p_note?: string }
        Returns: number
      }
      admin_review_subscription_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      can_use_guest_ai_credit: { Args: { p_ip_hash: string }; Returns: boolean }
      claim_free_ai_credits: { Args: never; Returns: number }
      consume_ai_credit: { Args: never; Returns: number }
      consume_guest_ai_credit: { Args: { p_ip_hash: string }; Returns: boolean }
      finalize_agent_project_file_staging: {
        Args: { p_import_id: string; p_project_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: { Args: { _user_id: string }; Returns: boolean }
      process_cpa_grip_conversion: {
        Args: { p_provider_event_id?: string; p_tracking_id: string }
        Returns: Json
      }
      record_video_view: { Args: { p_video_id: string }; Returns: undefined }
      redeem_invite: { Args: { _code: string }; Returns: Json }
      replace_agent_project_files: {
        Args: { p_files: Json; p_project_id: string }
        Returns: number
      }
      start_cpa_offer: {
        Args: { p_offer_id: string }
        Returns: {
          destination_url: string
          tracking_id: string
          tracking_parameter: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "developer" | "member" | "creator"
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
      app_role: ["admin", "developer", "member", "creator"],
    },
  },
} as const
