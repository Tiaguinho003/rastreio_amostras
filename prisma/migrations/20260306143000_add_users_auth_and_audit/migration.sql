CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CLASSIFIER', 'REGISTRATION', 'COMMERCIAL');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InitialPasswordDecision" AS ENUM ('PENDING', 'KEPT', 'CHANGED');
CREATE TYPE "UserSessionEndReason" AS ENUM (
  'LOGOUT',
  'EXPIRED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'USERNAME_CHANGED',
  'ROLE_CHANGED',
  'INACTIVATED',
  'REVOKED'
);
CREATE TYPE "UserAuditEventType" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ROLE_CHANGED',
  'USER_INACTIVATED',
  'USER_REACTIVATED',
  'USER_UNLOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_BY_ADMIN',
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGOUT',
  'SESSION_EXPIRED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'EMAIL_CHANGE_REQUESTED',
  'EMAIL_CHANGE_CONFIRMED',
  'INITIAL_PASSWORD_DECISION_RECORDED'
);

CREATE TABLE "app_user" (
  "id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "username_canonical" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "email_canonical" TEXT NOT NULL,
  "phone" TEXT,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "initial_password_decision" "InitialPasswordDecision" NOT NULL DEFAULT 'PENDING',
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_session" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "end_reason" "UserSessionEndReason",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6),
  "created_ip" TEXT,
  "created_user_agent" TEXT,
  CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_request" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "email_canonical" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
  "retry_available_at" TIMESTAMPTZ(6) NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "invalidated_at" TIMESTAMPTZ(6),
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_change_request" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "new_email" TEXT NOT NULL,
  "new_email_canonical" TEXT NOT NULL,
  "reservation_key" TEXT,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
  "retry_available_at" TIMESTAMPTZ(6) NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "invalidated_at" TIMESTAMPTZ(6),
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_change_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_audit_event" (
  "event_id" UUID NOT NULL,
  "target_user_id" UUID,
  "actor_user_id" UUID,
  "event_type" "UserAuditEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "reason_text" TEXT,
  "request_id" TEXT NOT NULL,
  "correlation_id" TEXT,
  "metadata_ip" TEXT,
  "metadata_user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_audit_event_pkey" PRIMARY KEY ("event_id")
);

CREATE UNIQUE INDEX "uq_user_username_canonical" ON "app_user"("username_canonical");
CREATE UNIQUE INDEX "uq_user_email_canonical" ON "app_user"("email_canonical");
CREATE UNIQUE INDEX "uq_email_change_reservation_key" ON "email_change_request"("reservation_key");

CREATE INDEX "idx_user_status_created_id" ON "app_user"("status", "created_at" DESC, "id");
CREATE INDEX "idx_user_role_created_id" ON "app_user"("role", "created_at" DESC, "id");
CREATE INDEX "idx_user_created_id" ON "app_user"("created_at" DESC, "id");
CREATE INDEX "idx_user_session_user_created" ON "user_session"("user_id", "created_at" DESC);
CREATE INDEX "idx_user_session_lookup" ON "user_session"("user_id", "revoked_at", "expires_at");
CREATE INDEX "idx_user_session_expires_at" ON "user_session"("expires_at");
CREATE INDEX "idx_password_reset_user_created" ON "password_reset_request"("user_id", "created_at" DESC);
CREATE INDEX "idx_password_reset_email_created" ON "password_reset_request"("email_canonical", "created_at" DESC);
CREATE INDEX "idx_password_reset_retry_available" ON "password_reset_request"("retry_available_at");
CREATE INDEX "idx_email_change_user_created" ON "email_change_request"("user_id", "created_at" DESC);
CREATE INDEX "idx_email_change_new_email_created" ON "email_change_request"("new_email_canonical", "created_at" DESC);
CREATE INDEX "idx_email_change_retry_available" ON "email_change_request"("retry_available_at");
CREATE INDEX "idx_user_audit_target_created" ON "user_audit_event"("target_user_id", "created_at" DESC);
CREATE INDEX "idx_user_audit_actor_created" ON "user_audit_event"("actor_user_id", "created_at" DESC);
CREATE INDEX "idx_user_audit_event_type_created" ON "user_audit_event"("event_type", "created_at" DESC);
CREATE INDEX "idx_user_audit_created" ON "user_audit_event"("created_at" DESC);

ALTER TABLE "user_session"
  ADD CONSTRAINT "user_session_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "password_reset_request"
  ADD CONSTRAINT "password_reset_request_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_change_request"
  ADD CONSTRAINT "email_change_request_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_audit_event"
  ADD CONSTRAINT "user_audit_event_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_audit_event"
  ADD CONSTRAINT "user_audit_event_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION set_updated_at_app_user()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_updated_at_app_user
BEFORE UPDATE ON "app_user"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_app_user();

CREATE OR REPLACE FUNCTION reject_user_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'user_audit_event is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reject_user_audit_event_update
BEFORE UPDATE ON "user_audit_event"
FOR EACH ROW
EXECUTE FUNCTION reject_user_audit_event_mutation();

CREATE TRIGGER trg_reject_user_audit_event_delete
BEFORE DELETE ON "user_audit_event"
FOR EACH ROW
EXECUTE FUNCTION reject_user_audit_event_mutation();
