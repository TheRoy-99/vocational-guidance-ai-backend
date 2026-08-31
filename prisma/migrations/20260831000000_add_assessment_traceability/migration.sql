-- Idempotent migration for databases that were initially synchronized with
-- Prisma db push (and therefore do not have _prisma_migrations).

ALTER TABLE public."chaside_assessments"
  ADD COLUMN IF NOT EXISTS "engineVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "questionnaireVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "scoringVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "currentPhase" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"AssessmentStatus"'::regtype AND enumlabel = 'IN_PROGRESS') THEN
    ALTER TYPE "AssessmentStatus" ADD VALUE 'IN_PROGRESS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"AssessmentStatus"'::regtype AND enumlabel = 'COMPLETED') THEN
    ALTER TYPE "AssessmentStatus" ADD VALUE 'COMPLETED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"AssessmentStatus"'::regtype AND enumlabel = 'ABANDONED') THEN
    ALTER TYPE "AssessmentStatus" ADD VALUE 'ABANDONED';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."assessment_answers" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "answerValue" JSONB NOT NULL,
  "position" INTEGER NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "questionText" TEXT,
  "questionType" TEXT,
  "options" JSONB,
  CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_answers_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."assessment_phase_events" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "questionId" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "assessment_phase_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_phase_events_eventId_key" UNIQUE ("eventId"),
  CONSTRAINT "assessment_phase_events_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."assessment_area_results" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "rank" INTEGER NOT NULL,
  "percentage" DOUBLE PRECISION,
  "dimensions" JSONB,
  CONSTRAINT "assessment_area_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_area_results_assessmentId_areaId_key" UNIQUE ("assessmentId", "areaId"),
  CONSTRAINT "assessment_area_results_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "assessment_answers_assessmentId_phase_idx" ON public."assessment_answers" ("assessmentId", "phase");
CREATE INDEX IF NOT EXISTS "assessment_answers_questionId_idx" ON public."assessment_answers" ("questionId");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_answers_assessmentId_questionId_key" ON public."assessment_answers" ("assessmentId", "questionId");
CREATE INDEX IF NOT EXISTS "assessment_phase_events_assessmentId_timestamp_idx" ON public."assessment_phase_events" ("assessmentId", "timestamp");
CREATE INDEX IF NOT EXISTS "assessment_phase_events_assessmentId_phase_eventType_idx" ON public."assessment_phase_events" ("assessmentId", "phase", "eventType");
CREATE INDEX IF NOT EXISTS "assessment_area_results_areaId_rank_idx" ON public."assessment_area_results" ("areaId", "rank");
