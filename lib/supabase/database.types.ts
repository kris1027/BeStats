export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      user_episode_state: {
        Row: {
          created_at: string
          episode_id: number
          episode_number: number
          rating: number | null
          season_number: number
          show_id: number
          updated_at: string
          user_id: string
          watched_at: string | null
        }
        Insert: {
          created_at?: string
          episode_id: number
          episode_number: number
          rating?: number | null
          season_number: number
          show_id: number
          updated_at?: string
          user_id: string
          watched_at?: string | null
        }
        Update: {
          created_at?: string
          episode_id?: number
          episode_number?: number
          rating?: number | null
          season_number?: number
          show_id?: number
          updated_at?: string
          user_id?: string
          watched_at?: string | null
        }
        Relationships: []
      }
      user_movie_state: {
        Row: {
          created_at: string
          in_watchlist: boolean
          movie_id: number
          rating: number | null
          updated_at: string
          user_id: string
          watched_at: string | null
          watchlisted_at: string | null
        }
        Insert: {
          created_at?: string
          in_watchlist?: boolean
          movie_id: number
          rating?: number | null
          updated_at?: string
          user_id: string
          watched_at?: string | null
          watchlisted_at?: string | null
        }
        Update: {
          created_at?: string
          in_watchlist?: boolean
          movie_id?: number
          rating?: number | null
          updated_at?: string
          user_id?: string
          watched_at?: string | null
          watchlisted_at?: string | null
        }
        Relationships: []
      }
      user_show_state: {
        Row: {
          created_at: string
          show_id: number
          tracked_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          show_id: number
          tracked_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          show_id?: number
          tracked_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_tracked_shows: {
        Row: {
          last_activity_at: string | null
          last_regular_watched_at: string | null
          last_watched_at: string | null
          show_id: number | null
          tracked_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      mark_episode_watched: {
        Args: {
          p_episode_id: number
          p_episode_number: number
          p_season_number: number
          p_show_id: number
        }
        Returns: {
          created_at: string
          episode_id: number
          episode_number: number
          newly_marked: boolean
          rating: number
          season_number: number
          show_id: number
          show_tracked: boolean
          updated_at: string
          user_id: string
          watched_at: string
        }[]
      }
      mark_movie_watched: {
        Args: { p_movie_id: number }
        Returns: {
          created_at: string
          in_watchlist: boolean
          movie_id: number
          rating: number | null
          updated_at: string
          user_id: string
          watched_at: string | null
          watchlisted_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_movie_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_season_watched: {
        Args: {
          p_episode_ids: number[]
          p_episode_numbers: number[]
          p_season_number: number
          p_show_id: number
        }
        Returns: {
          marked_ids: number[]
          show_tracked: boolean
        }[]
      }
      rate_episode: {
        Args: {
          p_episode_id: number
          p_episode_number: number
          p_rating: number
          p_season_number: number
          p_show_id: number
        }
        Returns: {
          created_at: string
          episode_id: number
          episode_number: number
          rating: number
          season_number: number
          show_id: number
          show_tracked: boolean
          updated_at: string
          user_id: string
          watched_at: string
        }[]
      }
      rate_movie: {
        Args: { p_movie_id: number; p_rating: number }
        Returns: {
          created_at: string
          in_watchlist: boolean
          movie_id: number
          rating: number | null
          updated_at: string
          user_id: string
          watched_at: string | null
          watchlisted_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_movie_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_episodes_watched: {
        Args: { p_entries: Json; p_show_id: number }
        Returns: number
      }
      restore_movie_watched: {
        Args: { p_movie_id: number; p_watched_at: string }
        Returns: undefined
      }
      restore_movie_watchlist: {
        Args: { p_movie_id: number }
        Returns: undefined
      }
      restore_show_tracking: {
        Args: { p_show_id: number; p_tracked_at: string }
        Returns: {
          created_at: string
          show_id: number
          tracked_at: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_show_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_show: { Args: { p_show_id: number }; Returns: boolean }
      track_show_after_watch: {
        Args: {
          p_newly_watched: boolean
          p_season_number: number
          p_show_id: number
        }
        Returns: boolean
      }
      unmark_episodes_watched: {
        Args: { p_episode_ids: number[]; p_show_id: number }
        Returns: {
          episode_id: number
          watched_at: string
        }[]
      }
      untrack_show: {
        Args: { p_show_id: number }
        Returns: {
          tracked_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

