-- Bảng token email.
CREATE TABLE IF NOT EXISTS account_email_tokens (
  selector CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purpose ENUM('verify_email', 'reset_password') NOT NULL,
  account_role ENUM('customer', 'admin') NOT NULL,
  account_id INT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  credential_tag CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  used_at BIGINT UNSIGNED NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  INDEX email_token_account (account_role, account_id, purpose, created_at),
  INDEX email_token_delivery (email, purpose, created_at),
  INDEX email_token_expiry (expires_at)
) ENGINE=InnoDB;
