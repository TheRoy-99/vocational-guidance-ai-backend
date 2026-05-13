-- CreateEnum
CREATE TYPE "IcfesAnalysisStatus" AS ENUM ('PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "icfes_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "sourceHash" TEXT,
    "candidateName" TEXT,
    "registrationNumber" TEXT,
    "applicationDate" TEXT,
    "publicationDate" TEXT,
    "municipalityDepartment" TEXT,
    "institution" TEXT,
    "globalScore" INTEGER NOT NULL,
    "globalPercentile" INTEGER,
    "subjectScores" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "IcfesAnalysisStatus" NOT NULL DEFAULT 'PROCESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icfes_analyses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "icfes_analyses" ADD CONSTRAINT "icfes_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;