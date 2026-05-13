import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, IcfesAnalysis } from '@prisma/client';
import { createHash } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../prisma/prisma.service';

type UploadedPdfFile = {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
};

type PdfParseResult = {
  text: string;
};

type SubjectKey =
  | 'Lectura Crítica'
  | 'Matemáticas'
  | 'Sociales y Ciudadanas'
  | 'Ciencias Naturales'
  | 'Inglés';

type SubjectScore = {
  subject: SubjectKey;
  score: number;
  percentile: number | null;
};

type SubjectInsight = SubjectScore & {
  insight: string;
};

type ParsedIcfesReport = {
  candidateName: string | null;
  registrationNumber: string | null;
  applicationDate: string | null;
  publicationDate: string | null;
  municipalityDepartment: string | null;
  institution: string | null;
  globalScore: number;
  globalPercentile: number | null;
  subjectScores: SubjectScore[];
  strengths: SubjectInsight[];
  weaknesses: SubjectInsight[];
  recommendations: string[];
  summary: string;
};

const SUBJECTS: SubjectKey[] = [
  'Lectura Crítica',
  'Matemáticas',
  'Sociales y Ciudadanas',
  'Ciencias Naturales',
  'Inglés',
];

const SUBJECT_RECOMMENDATIONS: Record<SubjectKey, string> = {
  'Lectura Crítica': 'Refuerza comprensión lectora, inferencias y análisis de argumentos.',
  'Matemáticas': 'Practica razonamiento cuantitativo, álgebra básica y resolución paso a paso.',
  'Sociales y Ciudadanas': 'Trabaja lectura de contexto, ciudadanía y análisis de problemáticas sociales.',
  'Ciencias Naturales': 'Consolida interpretación de datos, método científico y relaciones entre variables.',
  Inglés: 'Fortalece vocabulario, lectura rápida y comprensión de textos cortos en inglés.',
};

@Injectable()
export class IcfesService {
  private readonly logger = new Logger(IcfesService.name);
  private schemaReady = false;
  private schemaBootstrapPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async analyze(userId: string, file: UploadedPdfFile): Promise<IcfesAnalysis> {
    try {
      await this.ensureSchema();
      this.ensurePdfBuffer(file);

      const fileHash = createHash('sha256').update(file.buffer).digest('hex');
      const parsed = await this.parsePdf(file.buffer);

      return await this.prisma.icfesAnalysis.create({
        data: {
          userId,
          fileName: file.originalname,
          fileSize: file.size,
          sourceHash: fileHash,
          candidateName: parsed.candidateName,
          registrationNumber: parsed.registrationNumber,
          applicationDate: parsed.applicationDate,
          publicationDate: parsed.publicationDate,
          municipalityDepartment: parsed.municipalityDepartment,
          institution: parsed.institution,
          globalScore: parsed.globalScore,
          globalPercentile: parsed.globalPercentile,
          subjectScores: parsed.subjectScores as Prisma.InputJsonValue,
          strengths: parsed.strengths as Prisma.InputJsonValue,
          weaknesses: parsed.weaknesses as Prisma.InputJsonValue,
          recommendations: parsed.recommendations as Prisma.InputJsonValue,
          summary: parsed.summary,
          status: 'PROCESSED',
        },
      });
    } catch (error: any) {
      this.logger.error('Error analyzing ICFES report', error?.stack || error?.message || String(error));

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('No fue posible analizar el PDF de ICFES');
    }
  }

  async findAll(userId: string): Promise<IcfesAnalysis[]> {
    await this.ensureSchema();

    return this.prisma.icfesAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLatest(userId: string): Promise<IcfesAnalysis | null> {
    await this.ensureSchema();

    return this.prisma.icfesAnalysis.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) {
      return;
    }

    if (!this.schemaBootstrapPromise) {
      this.schemaBootstrapPromise = this.bootstrapSchema()
        .then(() => {
          this.schemaReady = true;
        })
        .finally(() => {
          this.schemaBootstrapPromise = null;
        });
    }

    await this.schemaBootstrapPromise;
  }

  private async bootstrapSchema(): Promise<void> {
    const tableExists = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public.icfes_analyses') IS NOT NULL AS "exists"
    `;

    if (tableExists[0]?.exists) {
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE "IcfesAnalysisStatus" AS ENUM ('PROCESSED', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "icfes_analyses" (
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

        CONSTRAINT "icfes_analyses_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "icfes_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
  }

  private ensurePdfBuffer(file: UploadedPdfFile): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('El archivo PDF está vacío');
    }

    const header = file.buffer.subarray(0, 5).toString('utf8');
    if (header !== '%PDF-') {
      throw new BadRequestException('El archivo enviado no parece ser un PDF válido');
    }
  }

  private async parsePdf(buffer: Buffer): Promise<ParsedIcfesReport> {
    const parser = new PDFParse({ data: buffer });

    try {
      const parsedPdf = (await parser.getText()) as PdfParseResult;
      const normalizedText = this.normalizeText(parsedPdf.text);

      const candidateName = this.extractField(normalizedText, 'Nombre Completo', 'Identificación');
      const registrationNumber = this.extractField(normalizedText, 'Número de registro', 'Aplicación del examen');
      const applicationDate = this.extractField(normalizedText, 'Aplicación del examen', 'Publicación de resultados');
      const publicationDate = this.extractField(normalizedText, 'Publicación de resultados', 'Municipio - Departamento');
      const municipalityDepartment = this.extractField(normalizedText, 'Municipio - Departamento', 'Código DANE');
      const institution = this.extractField(normalizedText, 'Establecimiento educativo', '2. Reporte General');

      const globalScore = this.extractGlobalScore(normalizedText);
      const globalPercentile = this.extractGlobalPercentile(normalizedText);
      const subjectScores = this.extractSubjectScores(normalizedText);
      const insights = this.buildInsights(subjectScores);

      return {
        candidateName,
        registrationNumber,
        applicationDate,
        publicationDate,
        municipalityDepartment,
        institution,
        globalScore,
        globalPercentile,
        subjectScores,
        strengths: insights.strengths,
        weaknesses: insights.weaknesses,
        recommendations: insights.recommendations,
        summary: this.buildSummary(globalScore, globalPercentile, subjectScores, insights),
      };
    } finally {
      await parser.destroy();
    }
  }

  private normalizeText(value: string): string {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractField(text: string, startLabel: string, endLabel: string): string | null {
    const startIndex = text.indexOf(startLabel);

    if (startIndex === -1) {
      return null;
    }

    const start = startIndex + startLabel.length;
    const remaining = text.slice(start);
    const limit = endLabel ? remaining.indexOf(endLabel) : -1;

    if (!endLabel || limit === -1) {
      return null;
    }

    const rawValue = remaining.slice(0, limit);
    const cleanedValue = rawValue.replace(/^:\s*/, '').trim();

    return cleanedValue || null;
  }

  private extractGlobalScore(text: string): number {
    const match = text.match(/Puntaje global[\s\S]{0,120}?(\d{2,3})\s*\/\s*500/i);
    if (match?.[1]) {
      return Number(match[1]);
    }

    throw new BadRequestException('No se encontró el puntaje global en el PDF');
  }

  private extractGlobalPercentile(text: string): number | null {
    const match = text.match(/Tu puntaje superó al\s+(\d{1,3})\s*%/i);
    return match?.[1] ? Number(match[1]) : null;
  }

  private extractSubjectScores(text: string): SubjectScore[] {
    return SUBJECTS.map((subject) => {
      const subjectIndex = text.indexOf(`${subject} Puntaje`);

      if (subjectIndex === -1) {
        throw new BadRequestException(`No se pudo leer el bloque de ${subject} en el PDF`);
      }

      const chunk = text.slice(subjectIndex);
      const scoreMatch = chunk.match(/Puntaje[\s\S]{0,80}?(\d{2,3})\s*\/\s*100/i);
      const percentileMatch = chunk.match(/(\d{1,3})\s*Estudiantes a nivel nacional/i);

      if (!scoreMatch?.[1]) {
        throw new BadRequestException(`No se pudo leer el puntaje de ${subject}`);
      }

      return {
        subject,
        score: Number(scoreMatch[1]),
        percentile: percentileMatch?.[1] ? Number(percentileMatch[1]) : null,
      };
    });
  }

  private buildInsights(subjectScores: SubjectScore[]): {
    strengths: SubjectInsight[];
    weaknesses: SubjectInsight[];
    recommendations: string[];
  } {
    const sortedScores = [...subjectScores].sort((left, right) => right.score - left.score);
    const strengths = sortedScores.slice(0, 2).map((item) => ({
      ...item,
      insight: 'Este es uno de tus puntos más sólidos para orientar carrera y afinamiento.',
    }));

    const weaknesses = [...sortedScores]
      .reverse()
      .slice(0, 2)
      .map((item) => ({
        ...item,
        insight: 'Aquí tienes mayor margen de mejora con práctica dirigida.',
      }));

    const recommendationSet = new Set<string>();
    weaknesses.forEach((weakness) => {
      recommendationSet.add(SUBJECT_RECOMMENDATIONS[weakness.subject]);
    });

    return {
      strengths,
      weaknesses,
      recommendations: Array.from(recommendationSet),
    };
  }

  private buildSummary(
    globalScore: number,
    globalPercentile: number | null,
    subjectScores: SubjectScore[],
    insights: { strengths: SubjectInsight[]; weaknesses: SubjectInsight[] },
  ): string {
    const best = insights.strengths[0];
    const improvement = insights.weaknesses[0];
    const percentileText = globalPercentile !== null ? `percentil nacional ${globalPercentile}` : 'sin percentil nacional visible';

    return [
      `Tu puntaje global fue ${globalScore}/500 con ${percentileText}.`,
      best
        ? `Tu fortaleza principal aparece en ${best.subject} (${best.score}/100), útil para orientar carreras donde pesa la comprensión, el análisis o el razonamiento verbal/cuantitativo.`
        : '',
      improvement
        ? `Tu mayor oportunidad de mejora está en ${improvement.subject} (${improvement.score}/100), así que ahí conviene concentrar práctica específica.`
        : '',
      `El reporte se guardó solo con el resumen estructurado y no con el PDF completo, para proteger tu información.`,
    ]
      .filter(Boolean)
      .join(' ');
  }
}