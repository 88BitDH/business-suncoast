-- D1 schema for Suncoast business-contact email OTP
CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  proof_hash TEXT,
  proof_expires_at INTEGER,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_challenges (email_hash);
CREATE INDEX IF NOT EXISTS idx_otp_proof ON otp_challenges (proof_hash);
CREATE INDEX IF NOT EXISTS idx_otp_expiry ON otp_challenges (expires_at);

CREATE TABLE IF NOT EXISTS otp_limits (
  id TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_limit_expiry ON otp_limits (expires_at);
