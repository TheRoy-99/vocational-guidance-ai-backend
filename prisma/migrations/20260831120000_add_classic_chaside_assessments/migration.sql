-- Separate the classic CHASIDE instrument from the adaptive vocational engine.
-- Existing LEGACY rows are moved in-place by preserving their IDs and payloads.

CREATE TABLE IF NOT EXISTS public."chaside_assessments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rawAnswers" JSONB NOT NULL,
  "scores" JSONB,
  "contextData" JSONB,
  "aiAnalysis" TEXT,
  "topCareers" JSONB,
  "notRecommended" JSONB,
  "idealEnvironment" TEXT,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'PENDING',
  "instrumentVersion" TEXT,
  "scoringVersion" TEXT,
  "answerCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chaside_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chaside_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."chaside_assessment_answers" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionId" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "questionType" TEXT NOT NULL,
  "answerValue" JSONB NOT NULL,
  "position" INTEGER NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "questionVersion" TEXT,
  "questionText" TEXT,
  "options" JSONB,
  CONSTRAINT "chaside_assessment_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chaside_assessment_answers_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."chaside_assessment_scores" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "rawScore" DOUBLE PRECISION NOT NULL,
  "normalizedScore" DOUBLE PRECISION,
  "rank" INTEGER NOT NULL,
  CONSTRAINT "chaside_assessment_scores_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chaside_assessment_scores_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."chaside_assessment_recommendations" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "recommendationType" TEXT NOT NULL,
  "career" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "score" DOUBLE PRECISION,
  "reason" TEXT,
  "source" TEXT,
  CONSTRAINT "chaside_assessment_recommendations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chaside_assessment_recommendations_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES public."chaside_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chaside_assessment_answers_assessmentId_questionId_key" ON public."chaside_assessment_answers" ("assessmentId", "questionId");
CREATE INDEX IF NOT EXISTS "chaside_assessment_answers_assessmentId_category_idx" ON public."chaside_assessment_answers" ("assessmentId", "category");
CREATE INDEX IF NOT EXISTS "chaside_assessment_answers_questionId_category_idx" ON public."chaside_assessment_answers" ("questionId", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "chaside_assessment_scores_assessmentId_category_key" ON public."chaside_assessment_scores" ("assessmentId", "category");
CREATE INDEX IF NOT EXISTS "chaside_assessment_scores_category_rank_idx" ON public."chaside_assessment_scores" ("category", "rank");
CREATE UNIQUE INDEX IF NOT EXISTS "chaside_assessment_recommendations_assessmentId_type_rank_key" ON public."chaside_assessment_recommendations" ("assessmentId", "recommendationType", "rank");
CREATE INDEX IF NOT EXISTS "chaside_assessment_recommendations_career_idx" ON public."chaside_assessment_recommendations" ("career");
CREATE INDEX IF NOT EXISTS "chaside_assessment_recommendations_type_source_idx" ON public."chaside_assessment_recommendations" ("recommendationType", "source");

INSERT INTO public."chaside_assessments" (
  "id", "userId", "rawAnswers", "scores", "contextData", "aiAnalysis",
  "topCareers", "notRecommended", "idealEnvironment", "status",
  "answerCount", "startedAt", "completedAt", "createdAt", "updatedAt",
  "instrumentVersion", "scoringVersion"
)
SELECT
  v."id", v."userId", v."rawAnswers", v."scores", v."contextData", v."aiAnalysis",
  v."topCareers", v."notRecommended", v."idealEnvironment", v."status",
  CASE WHEN jsonb_typeof(v."rawAnswers") = 'array' THEN jsonb_array_length(v."rawAnswers") ELSE 0 END,
  v."startedAt", v."completedAt", v."createdAt", v."updatedAt",
  'CHASIDE_CLASSIC_1.0', 'CHASIDE_SCORING_1.0'
FROM public."vocational_assessments" v
WHERE v."assessmentType" = 'LEGACY'
ON CONFLICT ("id") DO NOTHING;

-- Backfill the normalized research tables for legacy assessments where the
-- historical payload contains the corresponding information.
INSERT INTO public."chaside_assessment_answers" (
  "id", "assessmentId", "questionId", "category", "questionType", "answerValue", "position", "questionVersion"
)
SELECT
  md5(v."id" || ':' || (answer->>'questionId')),
  v."id",
  (answer->>'questionId')::integer,
  answer->>'category',
  answer->>'type',
  answer->'value',
  row_number() OVER (PARTITION BY v."id" ORDER BY ordinality),
  'CHASIDE_CLASSIC_1.0'
FROM public."vocational_assessments" v
CROSS JOIN LATERAL jsonb_array_elements(v."rawAnswers") WITH ORDINALITY AS items(answer, ordinality)
WHERE v."assessmentType" = 'LEGACY'
  AND jsonb_typeof(v."rawAnswers") = 'array'
ON CONFLICT ("assessmentId", "questionId") DO NOTHING;

INSERT INTO public."chaside_assessment_scores" ("id", "assessmentId", "category", "rawScore", "rank")
SELECT
  md5(v."id" || ':score:' || item.key), v."id", item.key, item.value::double precision,
  row_number() OVER (PARTITION BY v."id" ORDER BY item.value::double precision DESC)
FROM public."vocational_assessments" v
CROSS JOIN LATERAL jsonb_each_text(v."scores") AS item(key, value)
WHERE v."assessmentType" = 'LEGACY' AND jsonb_typeof(v."scores") = 'object'
ON CONFLICT ("assessmentId", "category") DO NOTHING;

INSERT INTO public."chaside_assessment_recommendations" (
  "id", "assessmentId", "recommendationType", "career", "rank", "reason", "source"
)
SELECT
  md5(v."id" || ':recommended:' || ordinality), v."id", 'RECOMMENDED',
  COALESCE(item->>'career', item->>'name', item->>'title'), ordinality,
  COALESCE(item->>'justification', item->>'description'), 'AI'
FROM public."vocational_assessments" v
CROSS JOIN LATERAL jsonb_array_elements(v."topCareers") WITH ORDINALITY AS items(item, ordinality)
WHERE v."assessmentType" = 'LEGACY' AND jsonb_typeof(v."topCareers") = 'array'
  AND COALESCE(item->>'career', item->>'name', item->>'title') IS NOT NULL
ON CONFLICT ("assessmentId", "recommendationType", "rank") DO NOTHING;

INSERT INTO public."chaside_assessment_recommendations" (
  "id", "assessmentId", "recommendationType", "career", "rank", "reason", "source"
)
SELECT
  md5(v."id" || ':not-recommended:' || ordinality), v."id", 'NOT_RECOMMENDED',
  COALESCE(item->>'career', item->>'name', item->>'title'), ordinality,
  COALESCE(item->>'reason', item->>'description'), 'AI'
FROM public."vocational_assessments" v
CROSS JOIN LATERAL jsonb_array_elements(v."notRecommended") WITH ORDINALITY AS items(item, ordinality)
WHERE v."assessmentType" = 'LEGACY' AND jsonb_typeof(v."notRecommended") = 'array'
  AND COALESCE(item->>'career', item->>'name', item->>'title') IS NOT NULL
ON CONFLICT ("assessmentId", "recommendationType", "rank") DO NOTHING;

DELETE FROM public."vocational_assessments"
WHERE "assessmentType" = 'LEGACY';
