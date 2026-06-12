-- RALD Config — Supabase Schema
-- Sprint: Operator Platform · Feature Flags + Kill Switches + Country Governance · 2026-06-12
-- LILCKY STUDIO LIMITED

-- ── feature_flags ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'DISABLED'
                 CHECK (state IN ('ENABLED','DISABLED','BETA','INTERNAL','WAITLIST','COUNTRY_RESTRICTED')),
  countries    TEXT[] NOT NULL DEFAULT '{}',
  rollout_pct  INTEGER CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata     JSONB NOT NULL DEFAULT '{}',
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flags_state_idx ON feature_flags(state);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags: service write, public read"
  ON feature_flags FOR SELECT USING (true);
CREATE POLICY "feature_flags: service write"
  ON feature_flags FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: Core RALD feature flags ─────────────────────────────────────────────
INSERT INTO feature_flags (name, description, state) VALUES
  ('loop_voice_rooms',       'Loop audio rooms — core product',            'ENABLED'),
  ('loop_civic_rooms',       'Loop civic participation rooms',              'BETA'),
  ('loop_communities',       'Loop community features',                    'ENABLED'),
  ('messenger_voice_notes',  'Voice notes in Loop Messenger',              'ENABLED'),
  ('messenger_calls',        'Voice & video calls in Loop Messenger',      'ENABLED'),
  ('rald_mail',              'RALD Mail — email service',                  'WAITLIST'),
  ('payrald',                'PayRald — payments platform',                'INTERNAL'),
  ('gitrald',                'GitRald — CI/CD orchestration',              'INTERNAL'),
  ('developer_beta',         'Developer Platform — closed beta',           'BETA'),
  ('ai_assistants',          'AI assistant features across products',      'BETA'),
  ('rald_search',            'RALD Search — unified search',               'ENABLED'),
  ('rald_notify',            'RALD Notifications — SMS/email/push',        'ENABLED'),
  ('rald_inbox',             'RALD Unified Inbox',                         'ENABLED'),
  ('rald_realtime',          'RALD Realtime — WebSocket infrastructure',   'ENABLED'),
  ('webauthn_passkeys',      'Passkey / WebAuthn login',                   'BETA'),
  ('qr_login',               'QR code login',                              'ENABLED'),
  ('country_governance',     'Country activation/restriction system',      'ENABLED'),
  ('trust_engine',           'Centralized trust score computation',        'INTERNAL'),
  ('machine_identity',       'Machine identity + automatic rotation',      'INTERNAL')
ON CONFLICT (name) DO NOTHING;

-- ── kill_switches ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kill_switches (
  switch_id      UUID DEFAULT gen_random_uuid(),
  target         TEXT NOT NULL UNIQUE,
  active         BOOLEAN NOT NULL DEFAULT false,
  reason         TEXT NOT NULL DEFAULT '',
  activated_by   TEXT,
  activated_at   TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kill_switches_active_idx ON kill_switches(active);

ALTER TABLE kill_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kill_switches: service only"
  ON kill_switches FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: Core kill switch definitions (all inactive by default) ──────────────
INSERT INTO kill_switches (target, reason) VALUES
  ('registration',    'Emergency registration disable'),
  ('room_creation',   'Emergency room creation disable'),
  ('messaging',       'Emergency messaging disable'),
  ('mail',            'Emergency mail disable'),
  ('api_access',      'Emergency API access disable'),
  ('payments',        'Emergency payments disable'),
  ('developer_access','Emergency developer access disable')
ON CONFLICT (target) DO NOTHING;

-- ── country_configs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS country_configs (
  country_code        TEXT PRIMARY KEY,
  country_name        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'WAITLIST'
                        CHECK (status IN ('ACTIVE','WAITLIST','RESTRICTED','BETA','SANDBOX')),
  products            TEXT[] NOT NULL DEFAULT '{}',
  restrictions        TEXT[] NOT NULL DEFAULT '{}',
  regulatory_profile  TEXT,
  notes               TEXT NOT NULL DEFAULT '',
  activated_by        TEXT,
  activated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS country_configs_status_idx ON country_configs(status);

ALTER TABLE country_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "country_configs: read all"
  ON country_configs FOR SELECT USING (true);
CREATE POLICY "country_configs: service write"
  ON country_configs FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: Africa-first countries ──────────────────────────────────────────────
INSERT INTO country_configs (country_code, country_name, status, products, regulatory_profile, notes) VALUES
  ('NG', 'Nigeria',      'ACTIVE',   ARRAY['loop','messenger','rald_auth','rald_identity'], 'NG', 'Primary market — fully launched'),
  ('KE', 'Kenya',        'BETA',     ARRAY['loop','messenger','rald_auth'], 'KE', 'Beta launch'),
  ('GH', 'Ghana',        'BETA',     ARRAY['loop','messenger','rald_auth'], 'GH', 'Beta launch'),
  ('ZA', 'South Africa', 'WAITLIST', ARRAY[]::TEXT[], 'ZA', 'Waitlist — regulatory review pending'),
  ('GB', 'United Kingdom','SANDBOX', ARRAY[]::TEXT[], 'UK', 'Sandbox/dev only'),
  ('US', 'United States','SANDBOX',  ARRAY[]::TEXT[], 'US', 'Sandbox/dev only')
ON CONFLICT (country_code) DO NOTHING;

-- ── config_audit_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action     TEXT NOT NULL,
  admin_id   TEXT,
  ip         TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_audit_created_at_idx ON config_audit_logs(created_at DESC);

ALTER TABLE config_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_audit: service only"
  ON config_audit_logs FOR ALL USING (true) WITH CHECK (true);
