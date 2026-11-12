-- Bảng phiên đăng nhập.
CREATE TABLE IF NOT EXISTS app_sessions (
  session_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  expires_at BIGINT UNSIGNED NOT NULL,
  data MEDIUMTEXT NOT NULL,
  INDEX app_sessions_expiry (expires_at)
) ENGINE=InnoDB;
