export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      agent_project_checkpoints: {
        Row: { created_at: string; files: Json; id: string; name: string; project_id: string; user_id: string };
        Insert: { created_at?: string; files: Json; id?: string; name?: string; project_id: string; user_id: string };
        Update: { created_at?: string; files?: Json; id?: string; name?: string; project_id?: string; user_id?: string };
        Relationships: [
          { foreignKeyName: "agent_project_checkpoints_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "agent_projects"; referencedColumns: ["id"] },
          { foreignKeyName: "agent_project_checkpoints_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      agent_project_runs: {
        Row: {
          created_at: string;
          error_message: string | null;
          exit_code: number | null;
          finished_at: string | null;
          id: string;
          project_id: string;
          run_type: string;
          started_at: string;
          status: string;
          summary: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          exit_code?: number | null;
          finished_at?: string | null;
          id?: string;
          project_id: string;
          run_type: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          exit_code?: number | null;
          finished_at?: string | null;
          id?: string;
          project_id?: string;
          run_type?: string;
          started_at?: string;
          status?: string;
          summary?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_project_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "agent_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_projects: {
        Row: {
          created_at: string;
          default_branch: string;
          deployment_url: string | null;
          description: string;
          files: Json;
          framework: string;
          github_repo: string | null;
          id: string;
          last_build_at: string | null;
          last_build_status: string;
          messages: Json;
          name: string;
          published: boolean;
          repository_url: string | null;
          slug: string | null;
          updated_at: string;
          user_id: string;
          workspace_settings: Json;
        };
        Insert: {
          created_at?: string;
          default_branch?: string;
          deployment_url?: string | null;
          description?: string;
          files?: Json;
          framework?: string;
          github_repo?: string | null;
          id?: string;
          last_build_at?: string | null;
          last_build_status?: string;
          messages?: Json;
          name?: string;
          published?: boolean;
          repository_url?: string | null;
          slug?: string | null;
          updated_at?: string;
          user_id: string;
          workspace_settings?: Json;
        };
        Update: {
          created_at?: string;
          default_branch?: string;
          deployment_url?: string | null;
          description?: string;
          files?: Json;
          framework?: string;
          github_repo?: string | null;
          id?: string;
          last_build_at?: string | null;
          last_build_status?: string;
          messages?: Json;
          name?: string;
          published?: boolean;
          repository_url?: string | null;
          slug?: string | null;
          updated_at?: string;
          user_id?: string;
          workspace_settings?: Json;
        };
        Relationships: [];
      };
      ai_chats: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          role?: string;
          thread_id?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          role?: string;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_snippets: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          language: string;
          prompt: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          code?: string;
          created_at?: string;
          id?: string;
          language?: string;
          prompt?: string | null;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          language?: string;
          prompt?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      api_request_usage: {
        Row: {
          created_at: string;
          duration_ms: number;
          endpoint: string;
          id: string;
          method: string;
          request_bytes: number;
          response_bytes: number;
          service: string;
          status_code: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number;
          endpoint: string;
          id?: string;
          method: string;
          request_bytes?: number;
          response_bytes?: number;
          service: string;
          status_code: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_ms?: number;
          endpoint?: string;
          id?: string;
          method?: string;
          request_bytes?: number;
          response_bytes?: number;
          service?: string;
          status_code?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      auth_events: {
        Row: {
          created_at: string;
          event: string;
          id: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event: string;
          id?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auth_events_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_comments_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_posts: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link_url: string | null;
          media_url: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link_url?: string | null;
          media_url?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link_url?: string | null;
          media_url?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_posts_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_likes: {
        Row: { created_at: string; id: string; post_id: string; user_id: string };
        Insert: { created_at?: string; id?: string; post_id: string; user_id: string };
        Update: { created_at?: string; id?: string; post_id?: string; user_id?: string };
        Relationships: [
          { foreignKeyName: "community_likes_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "community_posts"; referencedColumns: ["id"] },
          { foreignKeyName: "community_likes_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      contact_messages: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          read_at: string | null;
          sender_email: string;
          sender_name: string;
          subject: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          read_at?: string | null;
          sender_email: string;
          sender_name: string;
          subject: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          read_at?: string | null;
          sender_email?: string;
          sender_name?: string;
          subject?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          downloads: number;
          file_name: string;
          id: string;
          mime_type: string | null;
          payout_account: string | null;
          price: number;
          size_bytes: number;
          storage_path: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          downloads?: number;
          file_name: string;
          id?: string;
          mime_type?: string | null;
          payout_account?: string | null;
          price?: number;
          size_bytes?: number;
          storage_path: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          downloads?: number;
          file_name?: string;
          id?: string;
          mime_type?: string | null;
          payout_account?: string | null;
          price?: number;
          size_bytes?: number;
          storage_path?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invite_links: {
        Row: {
          active: boolean;
          ai_credits: number;
          bonus_bytes: number;
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string | null;
          max_uses: number;
          uses: number;
        };
        Insert: {
          active?: boolean;
          ai_credits?: number;
          bonus_bytes?: number;
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          max_uses?: number;
          uses?: number;
        };
        Update: {
          active?: boolean;
          ai_credits?: number;
          bonus_bytes?: number;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          max_uses?: number;
          uses?: number;
        };
        Relationships: [];
      };
      invite_redemptions: {
        Row: {
          created_at: string;
          id: string;
          invite_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invite_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invite_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey";
            columns: ["invite_id"];
            isOneToOne: false;
            referencedRelation: "invite_links";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          ai_credits: number;
          ai_subscribed: boolean;
          ai_subscription_expires_at: string | null;
          avatar_url: string | null;
          bio: string | null;
          bonus_bytes: number;
          created_at: string;
          display_name: string | null;
          id: string;
          is_subscribed: boolean;
          storage_quota_bytes: number;
          theme: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          ai_credits?: number;
          ai_subscribed?: boolean;
          ai_subscription_expires_at?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          bonus_bytes?: number;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_subscribed?: boolean;
          storage_quota_bytes?: number;
          theme?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          ai_credits?: number;
          ai_subscribed?: boolean;
          ai_subscription_expires_at?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          bonus_bytes?: number;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_subscribed?: boolean;
          storage_quota_bytes?: number;
          theme?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      project_requests: {
        Row: {
          admin_note: string | null;
          contact: string | null;
          created_at: string;
          id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          skills: string | null;
          status: string;
          summary: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          admin_note?: string | null;
          contact?: string | null;
          created_at?: string;
          id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          skills?: string | null;
          status?: string;
          summary: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          admin_note?: string | null;
          contact?: string | null;
          created_at?: string;
          id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          skills?: string | null;
          status?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_requests_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      "public.community_posts": {
        Row: {
          created_at: string;
          id: number;
        };
        Insert: {
          created_at?: string;
          id?: number;
        };
        Update: {
          created_at?: string;
          id?: number;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          ad_settings: Json;
          ai_free_credits: number;
          ai_subscription_credits: number;
          ai_subscription_price: number;
          error_dialog_enabled: boolean;
          id: number;
          instagram_url: string;
          logo_url: string | null;
          owner_email: string;
          payout_account: string | null;
          site_name: string;
          subscription_price: number;
          subscription_quota_bytes: number;
          tagline: string;
          updated_at: string;
          youtube_url: string;
        };
        Insert: {
          ad_settings?: Json;
          ai_free_credits?: number;
          ai_subscription_credits?: number;
          ai_subscription_price?: number;
          error_dialog_enabled?: boolean;
          id?: number;
          instagram_url?: string;
          logo_url?: string | null;
          owner_email?: string;
          payout_account?: string | null;
          site_name?: string;
          subscription_price?: number;
          subscription_quota_bytes?: number;
          tagline?: string;
          updated_at?: string;
          youtube_url?: string;
        };
        Update: {
          ad_settings?: Json;
          ai_free_credits?: number;
          ai_subscription_credits?: number;
          ai_subscription_price?: number;
          error_dialog_enabled?: boolean;
          id?: number;
          instagram_url?: string;
          logo_url?: string | null;
          owner_email?: string;
          payout_account?: string | null;
          site_name?: string;
          subscription_price?: number;
          subscription_quota_bytes?: number;
          tagline?: string;
          updated_at?: string;
          youtube_url?: string;
        };
        Relationships: [];
      };
      subscription_requests: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          kind: string;
          method: string;
          note: string | null;
          reference: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          id?: string;
          kind?: string;
          method?: string;
          note?: string | null;
          reference: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          kind?: string;
          method?: string;
          note?: string | null;
          reference?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_requests_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      team_contacts: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          link: string | null;
          name: string;
          phone: string | null;
          role: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          link?: string | null;
          name: string;
          phone?: string | null;
          role?: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          link?: string | null;
          name?: string;
          phone?: string | null;
          role?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          title: string;
          updated_at: string;
          user_id: string;
          views: number;
          youtube_id: string;
          youtube_url: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          title: string;
          updated_at?: string;
          user_id: string;
          views?: number;
          youtube_id: string;
          youtube_url: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          views?: number;
          youtube_id?: string;
          youtube_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "videos_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_groups: {
        Row: {
          category: string;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_messages: {
        Row: {
          body: string;
          created_at: string;
          group_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          group_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          group_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_messages_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "workspace_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_messages_profile_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_roles: {
        Row: {
          assigned_by: string | null;
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_api_usage_summary: {
        Args: { p_since?: string };
        Returns: {
          average_duration_ms: number;
          endpoint: string;
          error_count: number;
          last_seen: string;
          method: string;
          request_count: number;
          service: string;
        }[];
      };
      admin_review_subscription_request: {
        Args: { p_approve: boolean; p_request_id: string };
        Returns: undefined;
      };
      consume_ai_credit: { Args: never; Returns: number };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_workspace_member: { Args: { _user_id: string }; Returns: boolean };
      redeem_invite: { Args: { _code: string }; Returns: Json };
    };
    Enums: {
      app_role: "admin" | "developer" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "developer", "member"],
    },
  },
} as const;
