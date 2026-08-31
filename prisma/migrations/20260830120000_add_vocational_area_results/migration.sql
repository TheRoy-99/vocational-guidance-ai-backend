ALTER TABLE "chaside_assessments"
ADD COLUMN "vocationalProfile" JSONB,
ADD COLUMN "vocationalResults" JSONB,
ADD COLUMN "assessmentType" TEXT NOT NULL DEFAULT 'LEGACY';
