CREATE UNIQUE INDEX IF NOT EXISTS uq_users_master_admin
  ON users (role)
  WHERE role = 'MASTER_ADMIN' AND active = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
