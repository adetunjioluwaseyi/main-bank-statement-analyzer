CREATE DATABASE IF NOT EXISTS statement_analyzer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE statement_analyzer;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ad_username VARCHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(32) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_ad_username (ad_username),
  KEY idx_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `login` (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL,
  success TINYINT(1) NOT NULL,
  failure_reason VARCHAR(64) NULL,
  session_token_hash CHAR(64) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  logged_out_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_login_session_token_hash (session_token_hash),
  KEY idx_login_user_created (user_id, created_at),
  KEY idx_login_username_created (username, created_at),
  KEY idx_login_session_expiry (expires_at),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_user_created (user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_action_created (action, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analyzed_statement_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  file_sha256 CHAR(64) NULL,
  status ENUM('success', 'failed') NOT NULL,
  transaction_count INT UNSIGNED NOT NULL DEFAULT 0,
  opening_balance DECIMAL(20, 2) NULL,
  closing_balance DECIMAL(20, 2) NULL,
  total_inflow DECIMAL(20, 2) NULL,
  total_outflow DECIMAL(20, 2) NULL,
  net_cash_flow DECIMAL(20, 2) NULL,
  integrity_status VARCHAR(40) NULL,
  integrity_score DECIMAL(5, 2) NULL,
  analysis_summary JSON NULL,
  failure_message VARCHAR(500) NULL,
  analyzed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_user_analyzed (user_id, analyzed_at),
  KEY idx_reports_status_analyzed (status, analyzed_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
