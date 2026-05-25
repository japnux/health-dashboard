// Types DB générés à la main pour le MVP.
// À remplacer par `npx supabase gen types typescript --project-id <id> > lib/types.ts`
// dès que la CLI Supabase est configurée.

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      daily_metrics: {
        Row: {
          date: string;
          hrv_ms: number | null;
          resting_hr_bpm: number | null;
          respiratory_rate: number | null;
          spo2_pct: number | null;
          sleep_total_min: number | null;
          sleep_rem_pct: number | null;
          sleep_deep_pct: number | null;
          sleep_awake_pct: number | null;
          steps: number | null;
          active_kcal: number | null;
          daylight_min: number | null;
          recovery_score: number | null;
          recovery_score_basis: "full" | "partial" | "estimated" | null;
          raw_payload: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          date: string;
          hrv_ms?: number | null;
          resting_hr_bpm?: number | null;
          respiratory_rate?: number | null;
          spo2_pct?: number | null;
          sleep_total_min?: number | null;
          sleep_rem_pct?: number | null;
          sleep_deep_pct?: number | null;
          sleep_awake_pct?: number | null;
          steps?: number | null;
          active_kcal?: number | null;
          daylight_min?: number | null;
          recovery_score?: number | null;
          recovery_score_basis?: "full" | "partial" | "estimated" | null;
          raw_payload?: Record<string, unknown> | null;
        };
        Update: Partial<Database["public"]["Tables"]["daily_metrics"]["Insert"]>;
        Relationships: [];
      };
      body_composition: {
        Row: {
          measured_at: string;
          weight_kg: number;
          body_fat_pct: number | null;
          lean_mass_kg: number | null;
          protein_target_g: number | null;
          created_at: string;
        };
        Insert: {
          measured_at: string;
          weight_kg: number;
          body_fat_pct?: number | null;
          lean_mass_kg?: number | null;
          protein_target_g?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["body_composition"]["Insert"]>;
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          started_at: string;
          type: string | null;
          duration_min: number | null;
          kcal: number | null;
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          started_at: string;
          type?: string | null;
          duration_min?: number | null;
          kcal?: number | null;
          source?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workouts"]["Insert"]>;
        Relationships: [];
      };
      dashboard_config: {
        Row: {
          id: number;
          sleep_target_min: number;
          steps_target: number;
          user_age: number | null;
          user_sex: string | null;
          user_height_cm: number | null;
          user_objective: string | null;
          user_activity: string | null;
          user_goals: string | null;
          bmr_kcal: number | null;
          tdee_kcal: number | null;
          meal_slots_config: Record<string, unknown> | null;
          day_profiles_config: Record<string, unknown> | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          sleep_target_min?: number;
          steps_target?: number;
          user_age?: number | null;
          user_sex?: string | null;
          user_height_cm?: number | null;
          user_objective?: string | null;
          user_activity?: string | null;
          user_goals?: string | null;
          bmr_kcal?: number | null;
          tdee_kcal?: number | null;
          meal_slots_config?: Record<string, unknown> | null;
          day_profiles_config?: Record<string, unknown> | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dashboard_config"]["Insert"]>;
        Relationships: [];
      };
      meal_logs: {
        Row: {
          id: string;
          date: string;
          label: string | null;
          source: string | null;
          calories: number;
          proteines_g: number;
          glucides_g: number;
          lipides_g: number;
          composants: unknown;
          confiance: string | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          label?: string | null;
          source?: string | null;
          calories?: number;
          proteines_g?: number;
          glucides_g?: number;
          lipides_g?: number;
          composants?: unknown;
          confiance?: string | null;
          logged_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meal_logs"]["Insert"]>;
        Relationships: [];
      };
      planned_activities: {
        Row: {
          id: string;
          date: string;
          type: string;
          count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          type: string;
          count?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["planned_activities"]["Insert"]>;
        Relationships: [];
      };
      protein_logs: {
        Row: {
          id: string;
          date: string;
          grams: number;
          source: string | null;
          label: string | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          grams: number;
          source?: string | null;
          label?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["protein_logs"]["Insert"]>;
        Relationships: [];
      };
      sync_logs: {
        Row: {
          id: string;
          created_at: string;
          source: string;
          status: string;
          summary: string | null;
          days_processed: number;
          workouts_processed: number;
          details: string[] | null;
          raw_payload: Record<string, unknown> | null;
          http_headers: Record<string, string> | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          source?: string;
          status?: string;
          summary?: string | null;
          days_processed?: number;
          workouts_processed?: number;
          details?: string[] | null;
          raw_payload?: Record<string, unknown> | null;
          http_headers?: Record<string, string> | null;
        };
        Update: Partial<Database["public"]["Tables"]["sync_logs"]["Insert"]>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          date: string;
          mood: number | null;
          energy: number | null;
          stress: number | null;
          notes: string | null;
          gratitude: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          date: string;
          mood?: number | null;
          energy?: number | null;
          stress?: number | null;
          notes?: string | null;
          gratitude?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["journal_entries"]["Insert"]>;
        Relationships: [];
      };
      ai_cache: {
        Row: {
          type: string;
          content: Record<string, unknown>;
          generated_at: string;
          data_version: string;
        };
        Insert: {
          type: string;
          content: Record<string, unknown>;
          generated_at?: string;
          data_version?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_cache"]["Insert"]>;
        Relationships: [];
      };
      blood_tests: {
        Row: {
          id: string;
          test_date: string;
          lab_name: string | null;
          notes: string | null;
          biological_age: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_date: string;
          lab_name?: string | null;
          notes?: string | null;
          biological_age?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["blood_tests"]["Insert"]>;
        Relationships: [];
      };
      blood_test_results: {
        Row: {
          id: string;
          test_id: string;
          category: string;
          biomarker_key: string;
          label: string;
          value: number;
          unit: string;
          ref_min: number | null;
          ref_max: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_id: string;
          category: string;
          biomarker_key: string;
          label: string;
          value: number;
          unit: string;
          ref_min?: number | null;
          ref_max?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["blood_test_results"]["Insert"]>;
        Relationships: [];
      };
      food_library: {
        Row: {
          id: string;
          name: string;
          name_normalized: string;
          calories_per_100g: number;
          proteines_per_100g: number;
          glucides_per_100g: number;
          lipides_per_100g: number;
          default_portion_g: number;
          source: string;
          usage_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          name_normalized: string;
          calories_per_100g: number;
          proteines_per_100g: number;
          glucides_per_100g: number;
          lipides_per_100g: number;
          default_portion_g: number;
          source?: string;
          usage_count?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["food_library"]["Insert"]>;
        Relationships: [];
      };
      sportigo_reservations: {
        Row: {
          id: string;
          user_key: "geoffrey" | "lauriane";
          reservation_id: string;
          event_id: string;
          room_id: number;
          discipline: string;
          date: string;
          starts_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_key: "geoffrey" | "lauriane";
          reservation_id: string;
          event_id: string;
          room_id: number;
          discipline: string;
          date: string;
          starts_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sportigo_reservations"]["Insert"]>;
        Relationships: [];
      };
      api_usage_logs: {
        Row: {
          id: string;
          created_at: string;
          endpoint: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          cached: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          endpoint: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          cached?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["api_usage_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
