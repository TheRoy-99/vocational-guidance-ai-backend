-- Safe in-place rename. It preserves IDs, rows, indexes and foreign keys.
ALTER TABLE IF EXISTS public."chaside_assessments"
  RENAME TO "vocational_assessments";

ALTER TABLE IF EXISTS public."vocational_assessments"
  RENAME CONSTRAINT "chaside_assessments_userId_fkey" TO "vocational_assessments_userId_fkey";

ALTER INDEX IF EXISTS public."chaside_assessments_pkey"
  RENAME TO "vocational_assessments_pkey";
