CREATE TYPE "FeedbackEvaluatorType" AS ENUM ('STUDENT_USER', 'EVALUATOR');
CREATE TYPE "FeedbackStatus" AS ENUM ('DRAFT', 'SUBMITTING', 'COMPLETED', 'ABANDONED');

CREATE TABLE "assessment_feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "evaluatorType" "FeedbackEvaluatorType" NOT NULL,
  "questionnaireVersion" TEXT NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'DRAFT',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "questionCountShown" INTEGER NOT NULL DEFAULT 0,
  "lastQuestionReached" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "clarityGain" INTEGER,
  "perceivedUtility" INTEGER,
  "selfPerceivedAlignment" INTEGER,
  "discoveryEffect" TEXT,
  "recommendationRelevance" INTEGER,
  "adaptiveLogicPerception" INTEGER,
  "questionRelevance" TEXT,
  "actionIntent" TEXT,
  "preTestClarity" INTEGER,
  "studentOutcome" TEXT,
  "studentPerceivedBenefits" JSONB,
  "systemResultCoherence" INTEGER,
  "adaptiveMethodologyPerception" INTEGER,
  "educationalPotential" TEXT,
  "vocationalGuidanceConfidence" INTEGER,
  "openFeedback" TEXT,
  "disagreementReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_feedback_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "assessment_feedback_responses" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "responseType" TEXT NOT NULL,
  "responseValue" JSONB,
  "responseText" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_feedback_responses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "assessment_feedback_events" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "position" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_feedback_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assessment_feedback_idempotencyKey_key" ON "assessment_feedback"("idempotencyKey");
CREATE INDEX "assessment_feedback_userId_createdAt_idx" ON "assessment_feedback"("userId", "createdAt");
CREATE INDEX "assessment_feedback_assessmentId_idx" ON "assessment_feedback"("assessmentId");
CREATE INDEX "assessment_feedback_evaluatorType_questionnaireVersion_idx" ON "assessment_feedback"("evaluatorType", "questionnaireVersion");
CREATE UNIQUE INDEX "assessment_feedback_responses_feedbackId_questionId_key" ON "assessment_feedback_responses"("feedbackId", "questionId");
CREATE INDEX "assessment_feedback_responses_questionId_responseType_idx" ON "assessment_feedback_responses"("questionId", "responseType");
CREATE INDEX "assessment_feedback_events_feedbackId_eventType_idx" ON "assessment_feedback_events"("feedbackId", "eventType");
ALTER TABLE "assessment_feedback" ADD CONSTRAINT "assessment_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_feedback" ADD CONSTRAINT "assessment_feedback_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "vocational_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_feedback_responses" ADD CONSTRAINT "assessment_feedback_responses_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "assessment_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_feedback_events" ADD CONSTRAINT "assessment_feedback_events_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "assessment_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
