ALTER TYPE "FeedbackStatus" ADD VALUE IF NOT EXISTS 'DISMISSED';
DO $$ BEGIN
  CREATE TYPE "FeedbackContext" AS ENUM ('ADAPTIVE_ASSESSMENT', 'ICFES', 'CHASIDE', 'PLATFORM_GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "assessment_feedback" ADD COLUMN IF NOT EXISTS "feedbackContext" "FeedbackContext" NOT NULL DEFAULT 'PLATFORM_GENERAL';
CREATE INDEX IF NOT EXISTS "assessment_feedback_feedbackContext_status_idx" ON "assessment_feedback"("feedbackContext", "status");
