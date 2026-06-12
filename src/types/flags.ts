// RALD Config — Feature Flag & Kill Switch Types
// LILCKY STUDIO LIMITED

export type FlagState =
  | "ENABLED"
  | "DISABLED"
  | "BETA"
  | "INTERNAL"
  | "WAITLIST"
  | "COUNTRY_RESTRICTED";

export type KillSwitchTarget =
  | "registration"
  | "room_creation"
  | "messaging"
  | "mail"
  | "api_access"
  | "country"
  | "product"
  | "payments"
  | string; // extensible

export type CountryStatus =
  | "ACTIVE"
  | "WAITLIST"
  | "RESTRICTED"
  | "BETA"
  | "SANDBOX";

export interface FeatureFlag {
  flag_id:     string;
  name:        string;           // e.g. "loop_voice_rooms"
  description: string;
  state:       FlagState;
  countries?:  string[];         // if COUNTRY_RESTRICTED, which countries
  rollout_pct?: number;          // 0-100, percentage of users
  metadata:    Record<string, unknown>;
  updated_by:  string;
  updated_at:  string;
  created_at:  string;
}

export interface KillSwitch {
  switch_id:   string;
  target:      KillSwitchTarget;
  active:      boolean;          // true = switch is ON = feature is DISABLED
  reason:      string;
  activated_by?: string;
  activated_at?: string;
  deactivated_at?: string;
  metadata:    Record<string, unknown>;
  created_at:  string;
}

export interface CountryConfig {
  country_code:  string;         // ISO 3166-1 alpha-2
  country_name:  string;
  status:        CountryStatus;
  products:      string[];       // which RALD products are available
  restrictions:  string[];       // which products are restricted
  regulatory_profile?: string;   // e.g. "NG", "KE", "ZA"
  activated_by?: string;
  activated_at?: string;
  notes:         string;
  created_at:    string;
  updated_at:    string;
}
