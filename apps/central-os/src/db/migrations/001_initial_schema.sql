CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('MASTER_ADMIN', 'USER')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  generated_at TIMESTAMPTZ,
  generated_at_source TEXT,
  generated_at_confidence TEXT,
  imported_at TIMESTAMPTZ NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE RESTRICT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  file_name_snapshot TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  rows_read INTEGER NOT NULL DEFAULT 0 CHECK (rows_read >= 0),
  excluded_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  eligible_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  not_found_count INTEGER NOT NULL DEFAULT 0 CHECK (not_found_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  excluded_by_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE IF NOT EXISTS execution_items (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE RESTRICT,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  os_number TEXT,
  contract_id TEXT,
  client_name TEXT,
  status TEXT NOT NULL,
  match_score NUMERIC,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_id_source TEXT,
  message_id_destination TEXT,
  failure_code TEXT,
  failure_message TEXT,
  review_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id, row_number)
);

CREATE TABLE IF NOT EXISTS execution_groups (
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('origin', 'destination')),
  jid TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  PRIMARY KEY (execution_id, role)
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER', 'WHATSAPP', 'SYSTEM', 'ADMIN_TOOL')),
  actor_ref TEXT,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  result TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY,
  key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);

CREATE TABLE IF NOT EXISTS group_configurations (
  id UUID PRIMARY KEY,
  origin_jid TEXT NOT NULL,
  origin_name_snapshot TEXT NOT NULL,
  destination_jid TEXT NOT NULL,
  destination_name_snapshot TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_imports_sha256 ON imports(sha256);
CREATE INDEX IF NOT EXISTS idx_imports_imported_at ON imports(imported_at);
CREATE INDEX IF NOT EXISTS idx_executions_import_created ON executions(import_id, created_at);
CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at);
CREATE INDEX IF NOT EXISTS idx_execution_items_execution_status ON execution_items(execution_id, status);
CREATE INDEX IF NOT EXISTS idx_execution_items_execution_os ON execution_items(execution_id, os_number);
CREATE INDEX IF NOT EXISTS idx_reports_execution_type ON reports(execution_id, type);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_group_configurations_active ON group_configurations(active);
