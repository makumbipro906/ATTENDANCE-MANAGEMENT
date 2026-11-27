-- Active: 1795738029343@@127.0.0.1@3306
CREATE TABLE IF NOT EXISTS school_settings (
  setting_key VARCHAR(32) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS application_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_years (
  id VARCHAR(36) PRIMARY KEY,
  year INT NOT NULL UNIQUE,
  is_current SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS terms (
  id VARCHAR(36) PRIMARY KEY,
  school_year_id VARCHAR(36) NOT NULL REFERENCES school_years(id) ON UPDATE CASCADE,
  name VARCHAR(128) NOT NULL,
  start_date VARCHAR(10) NOT NULL,
  end_date VARCHAR(10) NOT NULL,
  is_current SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (school_year_id, name)
);
CREATE INDEX IF NOT EXISTS idx_terms_year ON terms (school_year_id, start_date);

CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  level VARCHAR(16) NOT NULL
);

CREATE TABLE IF NOT EXISTS streams (
  id VARCHAR(36) PRIMARY KEY,
  class_id VARCHAR(36) NOT NULL REFERENCES classes(id) ON UPDATE CASCADE,
  name VARCHAR(128) NOT NULL,
  UNIQUE (class_id, name)
);

CREATE TABLE IF NOT EXISTS sections (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(36) PRIMARY KEY,
  admission_number VARCHAR(128) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth VARCHAR(10),
  gender VARCHAR(32) NOT NULL,
  student_phone VARCHAR(32),
  status VARCHAR(16) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_students_status_name ON students (status, full_name);

CREATE TABLE IF NOT EXISTS student_biometrics (
  student_id VARCHAR(36) PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  captured_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id VARCHAR(36) NOT NULL REFERENCES terms(id) ON UPDATE CASCADE,
  stream_id VARCHAR(36) NOT NULL REFERENCES streams(id) ON UPDATE CASCADE,
  section_id VARCHAR(36) NOT NULL REFERENCES sections(id) ON UPDATE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'Enrolled',
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_term_stream ON student_enrollments (term_id, stream_id, section_id, status);

CREATE TABLE IF NOT EXISTS guardians (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(128) NOT NULL,
  phone VARCHAR(32),
  email VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_guardians (
  student_id VARCHAR(36) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id VARCHAR(36) NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  is_primary SMALLINT NOT NULL DEFAULT 0,
  receives_sms SMALLINT NOT NULL DEFAULT 1,
  primary_student_id VARCHAR(36),
  PRIMARY KEY (student_id, guardian_id),
  UNIQUE (primary_student_id)
);
CREATE INDEX IF NOT EXISTS idx_guardian_student ON student_guardians (guardian_id);

CREATE TABLE IF NOT EXISTS devices (
  device_key VARCHAR(128) PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  model VARCHAR(128),
  time_zone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
  active SMALLINT NOT NULL DEFAULT 1,
  last_event_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_user_mappings (
  device_key VARCHAR(128) NOT NULL REFERENCES devices(device_key),
  device_user_id VARCHAR(128) NOT NULL,
  student_id VARCHAR(36) NOT NULL REFERENCES students(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_key, device_user_id)
);
CREATE INDEX IF NOT EXISTS idx_mapping_student ON device_user_mappings (student_id);

CREATE TABLE IF NOT EXISTS raw_device_events (
  id VARCHAR(36) PRIMARY KEY,
  device_key VARCHAR(128) NOT NULL REFERENCES devices(device_key),
  event_id VARCHAR(128) NOT NULL,
  device_user_id VARCHAR(128) NOT NULL,
  student_id VARCHAR(36) REFERENCES students(id),
  occurred_at VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  scan_result VARCHAR(16) NOT NULL,
  payload JSONB NOT NULL,
  processing_status VARCHAR(32) NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_key, event_id)
);
CREATE INDEX IF NOT EXISTS idx_event_status_time ON raw_device_events (processing_status, occurred_at);

CREATE TABLE IF NOT EXISTS attendance_records (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL REFERENCES students(id),
  enrollment_id VARCHAR(36) REFERENCES student_enrollments(id),
  device_key VARCHAR(128) NOT NULL REFERENCES devices(device_key),
  raw_event_id VARCHAR(36) NOT NULL UNIQUE REFERENCES raw_device_events(id),
  attendance_date VARCHAR(10) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  occurred_at VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, attendance_date, event_type)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON attendance_records (student_id, occurred_at);

CREATE TABLE IF NOT EXISTS school_calendar_days (
  calendar_date VARCHAR(10) PRIMARY KEY,
  term_id VARCHAR(36) NOT NULL REFERENCES terms(id) ON UPDATE CASCADE,
  is_school_day SMALLINT NOT NULL,
  check_in_cutoff VARCHAR(16),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_school_calendar_term ON school_calendar_days (term_id, is_school_day, calendar_date);

CREATE TABLE IF NOT EXISTS sms_notifications (
  id VARCHAR(36) PRIMARY KEY,
  attendance_id VARCHAR(36) REFERENCES attendance_records(id),
  student_id VARCHAR(36) NOT NULL REFERENCES students(id),
  recipient_phone VARCHAR(32),
  message_body VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255),
  last_error TEXT,
  retry_after VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attendance_id, recipient_phone)
);
CREATE INDEX IF NOT EXISTS idx_sms_queue ON sms_notifications (status, retry_after, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(36) PRIMARY KEY,
  actor_type VARCHAR(16) NOT NULL,
  actor_id VARCHAR(36),
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS staff_profiles (
  identity_id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL DEFAULT '',
  first_name VARCHAR(128) NOT NULL DEFAULT '',
  last_name VARCHAR(128) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  username VARCHAR(128) NOT NULL DEFAULT '',
  signature_data BYTEA,
  signature_mime VARCHAR(64),
  signature_file_name VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(128) UNIQUE,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NOT NULL,
  phone VARCHAR(32),
  password_hash TEXT,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(36) PRIMARY KEY,
  permission_key VARCHAR(128) NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(36) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS staff_user_roles (
  staff_user_id VARCHAR(36) NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_user_id, role_id)
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  staff_user_id VARCHAR(36) NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at VARCHAR(64) NOT NULL,
  last_activity_at VARCHAR(64) NOT NULL DEFAULT '',
  created_at VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_user ON staff_sessions (staff_user_id);

CREATE TABLE IF NOT EXISTS staff_login_otps (
  id VARCHAR(36) PRIMARY KEY,
  staff_user_id VARCHAR(36) NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'login',
  attempts INT NOT NULL DEFAULT 0,
  expires_at VARCHAR(64) NOT NULL,
  last_sent_at VARCHAR(64) NOT NULL,
  created_at VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_staff_login_otps_user ON staff_login_otps (staff_user_id, expires_at);

CREATE TABLE IF NOT EXISTS staff_password_setup_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  staff_user_id VARCHAR(36) NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL,
  expires_at VARCHAR(64) NOT NULL,
  created_at VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_staff_password_setup_user ON staff_password_setup_tokens (staff_user_id, expires_at);

CREATE TABLE IF NOT EXISTS staff_login_attempts (
  username VARCHAR(128) PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until VARCHAR(64),
  updated_at VARCHAR(64) NOT NULL DEFAULT ''
);

CREATE OR REPLACE VIEW student_records AS
SELECT s.id, s.admission_number, s.full_name, s.date_of_birth, s.gender,
       CAST(y.year AS TEXT) AS academic_year, t.name AS term, c.name AS class_name,
       st.name AS stream, sec.name AS section, pg.full_name AS guardian_name,
       pg.relationship, COALESCE(pg.phone, '') AS primary_phone,
       COALESCE(s.student_phone, '') AS student_phone,
       COALESCE(pg.email, '') AS guardian_email,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'name', g.full_name, 'relationship', g.relationship,
           'phone', COALESCE(g.phone, ''), 'email', COALESCE(g.email, '')
         ))
         FROM student_guardians ag
         JOIN guardians g ON g.id = ag.guardian_id
         WHERE ag.student_id = s.id AND ag.is_primary = 0
       ), '[]'::jsonb) AS additional_guardians,
       s.status, COALESCE(b.status, 'Pending') AS biometrics_status,
       b.captured_at AS biometrics_captured_at,
       e.id AS enrollment_id, t.id AS term_id, st.id AS stream_id, sec.id AS section_id
FROM students s
LEFT JOIN student_enrollments e ON e.id = (
  SELECT ce.id FROM student_enrollments ce
  JOIN terms ct ON ct.id = ce.term_id
  JOIN school_years cy ON cy.id = ct.school_year_id
  WHERE ce.student_id = s.id AND ce.status = 'Enrolled'
  ORDER BY cy.year DESC, ct.start_date DESC
  LIMIT 1
)
LEFT JOIN terms t ON t.id = e.term_id
LEFT JOIN school_years y ON y.id = t.school_year_id
LEFT JOIN streams st ON st.id = e.stream_id
LEFT JOIN classes c ON c.id = st.class_id
LEFT JOIN sections sec ON sec.id = e.section_id
LEFT JOIN student_guardians pl ON pl.student_id = s.id AND pl.is_primary = 1
LEFT JOIN guardians pg ON pg.id = pl.guardian_id
LEFT JOIN student_biometrics b ON b.student_id = s.id;
