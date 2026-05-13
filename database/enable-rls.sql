-- Enable Row Level Security on tables
-- Run this in Supabase SQL Editor to secure the tables

-- 1. Enable RLS on users table
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on chaside_assessments table
ALTER TABLE "public"."chaside_assessments" ENABLE ROW LEVEL SECURITY;

-- 3. Create policy for users table: Users can only see their own data
CREATE POLICY "Users can view own data" ON "public"."users"
  AS SELECT
  USING (auth.uid()::text = id);

CREATE POLICY "Users can update own data" ON "public"."users"
  AS UPDATE
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- 4. Create policy for assessments table: Users can only see their own assessments
CREATE POLICY "Users can view own assessments" ON "public"."chaside_assessments"
  AS SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own assessments" ON "public"."chaside_assessments"
  AS INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own assessments" ON "public"."chaside_assessments"
  AS UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Note: If you're not using Supabase Auth (auth.uid()), you'll need to adjust
-- the policies to match your authentication method (e.g., JWT claims, custom columns)
