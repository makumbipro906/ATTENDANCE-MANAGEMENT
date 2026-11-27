ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS github_user_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_github_user_id
  ON staff_users (github_user_id)
  WHERE github_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS github_oauth_states (
  state_hash VARCHAR(64) PRIMARY KEY,
  purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('login', 'link')),
  staff_user_id VARCHAR(36) REFERENCES staff_users(id) ON DELETE CASCADE,
  return_to VARCHAR(2048),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((purpose = 'login' AND staff_user_id IS NULL) OR
         (purpose = 'link' AND staff_user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_states_expiry
  ON github_oauth_states (expires_at);
