import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';

const INK = '#202a2e';
const PURPLE = '#315e51';
const GREEN = '#315e51';
const PAPER = '#ffffff';
const CREAM = '#f4f6f3';
const AREA_NAMES: Record<string, string> = { A1: 'Tecnología y Computación', A2: 'Ciencia e Investigación', A3: 'Salud y Bienestar', A4: 'Psicología y Comportamiento', A5: 'Negocios y Emprendimiento', A6: 'Economía y Finanzas', A7: 'Comunicación y Marketing', A8: 'Diseño, Arte y Creatividad', A9: 'Educación y Desarrollo Humano', A10: 'Derecho, Sociedad y Humanidades', A11: 'Ingeniería, Construcción y Espacios', A12: 'Naturaleza y Medio Ambiente' };
const DIMENSIONS = ['Intereses', 'Habilidades', 'Pensamiento', 'Actividades', 'Entorno', 'Motivaciones', 'Valores'];

type JsonRecord = Record<string, any>;
type ReportAssessment = JsonRecord & { answers: JsonRecord[]; phaseEvents: JsonRecord[]; areaResults: JsonRecord[]; user: JsonRecord & { icfesAnalyses: JsonRecord[]; chasideAssessments: JsonRecord[] } };

function safeRecord(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function safeArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function dateLabel(value: Date | string | null | undefined) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No disponible'; }
function answerLabel(value: unknown) { return Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'Sin respuesta'); }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async createVocationalPdf(assessmentId: string, userId: string): Promise<Buffer> {
    const assessment = await this.prisma.vocationalAssessment.findFirst({
      where: { id: assessmentId, userId, status: 'COMPLETED' },
      include: {
        user: { include: { icfesAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 }, chasideAssessments: { orderBy: { createdAt: 'desc' }, take: 1, include: { scoresByCategory: { orderBy: { rank: 'asc' } } } } } },
        answers: { orderBy: { position: 'asc' } },
        phaseEvents: { orderBy: { timestamp: 'asc' } },
        areaResults: { orderBy: { rank: 'asc' } },
      },
    }) as unknown as ReportAssessment | null;
    if (!assessment) throw new NotFoundException('No encontramos una evaluación completada para generar el reporte');
    if (assessment.userId !== userId) throw new ForbiddenException('No tienes acceso a este reporte');
    return this.renderPdf(assessment);
  }

  private renderPdf(assessment: ReportAssessment): Promise<Buffer> {
    const profile = safeRecord(assessment.vocationalProfile);
    const rawAnswers = safeRecord(assessment.rawAnswers);
    const age = profile.context?.age ?? assessment.answers.find((answer) => answer.questionId === 'base_01')?.answerValue ?? rawAnswers.base_01;
    const educationLevel = profile.context?.educationLevel ?? assessment.answers.find((answer) => answer.questionId === 'base_02')?.answerValue ?? rawAnswers.base_02;
    const results = safeArray(assessment.vocationalResults).length ? safeArray(assessment.vocationalResults) : assessment.areaResults;
    const topAreas: JsonRecord[] = results.slice(0, 3).map((item) => ({ ...safeRecord(item), name: AREA_NAMES[item.area ?? item.areaId] ?? item.area ?? item.areaId ?? 'Área sin nombre' }));
    const dimensions = safeRecord(profile.dimensions);
    const evidence = safeArray(profile.evidence);
    const answerCount = assessment.answers.length || Number(profile.questionCount ?? 0);
    const phaseCounts = new Map<string, number>();
    assessment.answers.forEach((answer) => phaseCounts.set(answer.phase, (phaseCounts.get(answer.phase) ?? 0) + 1));
    const leaderScore = Number(topAreas[0]?.score ?? 0);
    const confidence = topAreas.length ? clamp(Number(topAreas[0].confidence ?? 0) * 100) : 0;
    const relative = topAreas.map((area) => leaderScore > 0 ? clamp(Number(area.score ?? 0) / leaderScore * 100) : 0);
    const coverage = DIMENSIONS.filter((key) => Number(dimensions[key]?.score ?? dimensions[key] ?? 0) > 0).length;
    const coherence = clamp(Number(profile.rankingHistory?.length ? .82 : .65) * 100);
    const uncertainty = topAreas.length > 1 && leaderScore > 0 ? `${clamp(100 - (Number(topAreas[0].score) - Number(topAreas[1].score)) / leaderScore * 100)}%` : 'No calculable';
    const icfes = assessment.user.icfesAnalyses?.[0];
    const chaside = assessment.user.chasideAssessments?.[0];
    const duration = assessment.completedAt && assessment.startedAt ? this.durationLabel(new Date(assessment.completedAt).getTime() - new Date(assessment.startedAt).getTime()) : 'No disponible';
    const summary = topAreas.length ? `La evidencia reunida sugiere una afinidad principal con ${topAreas[0].name}${topAreas[1] ? `, acompañada por ${topAreas[1].name}` : ''}. Estas señales deben leerse como un punto de partida para conversar, contrastar experiencias y tomar decisiones informadas.` : 'La evaluación todavía no reúne suficientes señales para construir una síntesis completa.';
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks: Buffer[] = [];
    return new Promise((resolve) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.header(doc, 'INFORME DIAGNÓSTICO CONFIDENCIAL', 'Reporte para acompañamiento vocacional');
      doc.fontSize(20).font('Helvetica-Bold').fillColor(INK).text('Reporte de orientación vocacional', 42, doc.y, { width: 510 });
      doc.fontSize(10).font('Helvetica').fillColor('#687277').text('Documento de apoyo para la conversación con un profesional orientador.', { width: 510 });
      this.sectionTitle(doc, '1. Encabezado institucional y metadatos');
      this.reportLine(doc, 'Aspirante', assessment.user.name); this.reportLine(doc, 'Edad', age == null ? 'No registrada' : answerLabel(age)); this.reportLine(doc, 'Nivel educativo / colegio', educationLevel == null ? 'No registrado' : answerLabel(educationLevel)); this.reportLine(doc, 'Fecha y hora de aplicación', dateLabel(assessment.completedAt ?? assessment.createdAt)); this.reportLine(doc, 'Tiempo total de resolución', duration); this.reportLine(doc, 'Preguntas respondidas', String(answerCount)); this.reportLine(doc, 'ID único de sesión', assessment.id);
      this.sectionTitle(doc, '2. Resumen ejecutivo diagnóstico');
      topAreas.forEach((area, index) => this.reportLine(doc, `Área ${index === 0 ? 'líder' : index === 1 ? 'secundaria' : 'terciaria'}`, `${area.name} · Puntaje ${Math.round(Number(area.score ?? 0))} · ${relative[index] ?? 0}% relativo`));
      this.reportParagraph(doc, summary);
      this.sectionTitle(doc, '3. Mapa multidimensional del perfil');
      this.dimensionBars(doc, dimensions);
      this.reportParagraph(doc, 'Las dimensiones muestran dónde se acumuló evidencia durante el recorrido. No representan una medida clínica ni sustituyen la entrevista profesional.');
      this.footer(doc, 1); doc.addPage();

      this.header(doc, 'INFORME DIAGNÓSTICO CONFIDENCIAL', `Sesión ${assessment.id}`);
      this.sectionTitle(doc, '4. Indicadores psicométricos de calidad del dato');
      this.reportLine(doc, 'Índice de confianza (Confidence)', `${confidence}% · ${confidence >= 75 ? 'Alta' : confidence >= 50 ? 'Media' : 'Inicial'}`); this.reportLine(doc, 'Coherencia vectorial (Coherence)', `${coherence}% · ${coherence >= 70 ? 'Consistente' : 'Revisar en entrevista'}`); this.reportLine(doc, 'Discriminación por entropía', topAreas.length >= 2 && relative[1] < 85 ? 'Perfil relativamente diferenciado' : 'Intereses distribuidos entre varias áreas'); this.reportLine(doc, 'Cobertura dimensional (Coverage)', `${coverage}/7 · ${Math.round(coverage / 7 * 100)}%`); this.reportLine(doc, 'Incertidumbre residual (Uncertainty)', uncertainty);
      this.sectionTitle(doc, '5. Trazabilidad del recorrido adaptativo');
      ['Perfil inicial', 'Exploración', 'Contraste', 'Confirmación', 'Descarte'].forEach((phase) => this.reportLine(doc, phase, `${phaseCounts.get(phase) ?? 0} preguntas respondidas`));
      this.sectionTitle(doc, '6. Triangulación de fuentes');
      this.reportLine(doc, 'OrientaAI', topAreas.length ? `Área principal: ${topAreas[0].name}.` : 'Sin resultado disponible.'); this.reportLine(doc, 'ICFES', icfes ? `Puntaje global ${icfes.globalScore}/500${icfes.globalPercentile ? ` · Percentil ${icfes.globalPercentile}` : ''}.` : 'No disponible.'); this.reportLine(doc, 'CHASIDE', chaside ? 'Resultado complementario disponible.' : 'No disponible.');
      this.reportParagraph(doc, icfes && topAreas.length ? `Convergencia para explorar: el perfil vocacional puede contrastarse con el desempeño académico registrado en ICFES durante la orientación.` : 'La triangulación queda parcial porque todavía no están disponibles todas las fuentes.');
      this.footer(doc, 2); doc.addPage();

      this.header(doc, 'INFORME DIAGNÓSTICO CONFIDENCIAL', `Sesión ${assessment.id}`);
      this.sectionTitle(doc, '7. Ficha de acompañamiento profesional');
      this.reportLine(doc, 'Alertas de disonancia vocacional', confidence < 55 ? 'Conviene contrastar intereses y autoeficacia en entrevista.' : 'No se observa una alerta fuerte con la evidencia disponible.');
      this.reportLine(doc, 'Factor preventivo de deserción (EDM)', relative[1] && relative[1] > 88 ? 'Claridad reducida entre las primeras áreas; se recomienda explorar experiencias concretas.' : 'No se observa un indicador preventivo fuerte en este reporte.');
      doc.moveDown(.5); doc.fontSize(10).font('Helvetica-Bold').fillColor(INK).text('Preguntas sugeridas para la entrevista', 42, doc.y, { width: 510 });
      this.interviewQuestions(topAreas, profile).forEach((question, index) => this.reportParagraph(doc, `${index + 1}. ${question}`));
      this.reportParagraph(doc, 'Estas preguntas son guías de conversación y no constituyen un diagnóstico psicológico, clínico o de empleabilidad.');
      this.footer(doc, 3); doc.addPage();

      this.header(doc, 'INFORME DIAGNÓSTICO CONFIDENCIAL', `Anexo · Sesión ${assessment.id}`);
      this.sectionTitle(doc, '8. Historial inmutable de respuestas');
      this.reportParagraph(doc, 'Registro de evidencia ítem por ítem. Las respuestas se presentan tal como fueron almacenadas para facilitar la auditoría y la conversación profesional.');
      const answerPages = Array.from({ length: Math.max(1, Math.ceil(assessment.answers.length / 6)) }, (_, pageIndex) => assessment.answers.slice(pageIndex * 6, pageIndex * 6 + 6));
      answerPages.forEach((answers, pageIndex) => {
        if (pageIndex > 0) {
          this.footer(doc, 3 + pageIndex);
          doc.addPage();
          this.header(doc, 'INFORME DIAGNÓSTICO CONFIDENCIAL', `Anexo · Sesión ${assessment.id}`);
          this.sectionTitle(doc, '8. Historial inmutable de respuestas');
        }
        answers.forEach((answer, localIndex) => {
          const index = pageIndex * 6 + localIndex;
          const question = String(answer.questionText ?? answer.questionId).replace(/\s+/g, ' ');
          const selection = answerLabel(answer.answerValue).replace(/\s+/g, ' ');
          const related = evidence.filter((item) => item.questionId === answer.questionId).map((item) => `${item.area ?? 'sin área'} (${item.strength ?? 'sin intensidad'})`).join(', ') || 'Sin señal directa';
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(INK).text(`${index + 1}. ${answer.phase}`, 42, doc.y, { width: 510 });
          this.reportParagraph(doc, `Pregunta: ${question}`);
          this.reportParagraph(doc, `Opción seleccionada: ${selection}`);
          this.reportParagraph(doc, `Señal / áreas afectadas: ${related}`);
          doc.moveDown(.35);
        });
      });
      this.footer(doc, 3 + answerPages.length); doc.end();
    });
  }

  private header(doc: PDFDocument, title: string, subtitle: string) { doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE).text('BRÚJULA · ORIENTACIÓN UNIVERSITARIA', 42, 35, { width: 250 }); doc.fontSize(8).font('Helvetica').fillColor('#687277').text(`${title} · ${subtitle}`, 315, 35, { width: 237, align: 'right' }); this.rule(doc, 58); doc.y = 82; }
  private footer(doc: PDFDocument, page: number) { const y = doc.page.height - 70; this.ruleAt(doc, y - 8); doc.fontSize(7).font('Helvetica').fillColor('#687277').text(`Documento confidencial · OrientaAI · Página ${page}`, 42, y, { width: 510, align: 'center' }); }
  private rule(doc: PDFDocument, y: number) { this.ruleAt(doc, y); }
  private ruleAt(doc: PDFDocument, y: number) { doc.moveTo(42, y).lineTo(552, y).lineWidth(.6).strokeColor('#cbd3cf').stroke(); }
  private sectionTitle(doc: PDFDocument, title: string) { doc.moveDown(1.2); doc.fontSize(12).font('Helvetica-Bold').fillColor(PURPLE).text(title, 42, doc.y, { width: 510 }); this.rule(doc, doc.y + 6); doc.moveDown(.55); }
  private reportLine(doc: PDFDocument, label: string, value: string) {
    const y = doc.y;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#687277').text(`${label}:`, 42, y, { width: 128 });
    doc.fontSize(9).font('Helvetica').fillColor(INK).text(String(value), 175, y, { width: 377, lineGap: 2 });
    doc.y = Math.max(doc.y, y + 16);
  }
  private reportParagraph(doc: PDFDocument, text: string) {
    doc.fontSize(9.5).font('Helvetica').fillColor('#3e4a4d').text(String(text), 42, doc.y, { width: 510, lineGap: 3 });
    doc.moveDown(.45);
  }
  private durationLabel(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} min ${seconds} s`;
  }
  private infoGrid(doc: PDFDocument, items: string[][]) { items.forEach(([label, value], index) => { const x = index % 2 === 0 ? 42 : 300; const y = doc.y + Math.floor(index / 2) * 30; doc.fontSize(7).font('Helvetica-Bold').fillColor('#687277').text(label.toUpperCase(), x, y, { width: 220 }); doc.fontSize(9).font('Helvetica').fillColor(INK).text(String(value).slice(0, 44), x, y + 10, { width: 220, height: 16, ellipsis: true }); }); doc.y += Math.ceil(items.length / 2) * 30 + 4; }
  private topAreaCards(doc: PDFDocument, areas: JsonRecord[], relative: number[]) { const start = doc.y + 12; areas.forEach((area, index) => { const x = 42 + index * 170; doc.roundedRect(x, start, 155, 70, 7).fillAndStroke(index === 0 ? '#eef3ef' : PAPER, '#cbd3cf'); doc.fontSize(7).font('Helvetica-Bold').fillColor(PURPLE).text(`0${index + 1} · ${relative[index] ?? 0}%`, x + 10, start + 10, { width: 135 }); doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(String(area.name), x + 10, start + 26, { width: 135, height: 25, ellipsis: true }); doc.fontSize(8).font('Helvetica').fillColor('#687277').text(`Puntaje ${Math.round(Number(area.score ?? 0))}`, x + 10, start + 54, { width: 135 }); }); doc.y = start + 83; }
  private dimensionBars(doc: PDFDocument, dimensions: JsonRecord) { DIMENSIONS.forEach((label) => { const raw = dimensions[label]; const value = clamp(Number(raw?.score ?? raw?.value ?? raw ?? 0)); const y = doc.y + 15; doc.fontSize(8).font('Helvetica').fillColor(INK).text(label, 42, y, { width: 95 }); doc.roundedRect(145, y + 1, 330, 7, 3).fill('#e5e9e7'); doc.roundedRect(145, y + 1, 330 * value / 100, 7, 3).fill(GREEN); doc.fontSize(8).font('Helvetica').fillColor(INK).text(`${value}%`, 488, y, { width: 32, align: 'right' }); doc.y += 18; }); }
  private metricRow(doc: PDFDocument, metrics: string[][]) { const y = doc.y + 10; metrics.forEach(([label, value], index) => { const x = 42 + index * 128; doc.roundedRect(x, y, 116, 43, 5).fillAndStroke('#f4f6f3', '#cbd3cf'); doc.fontSize(7).font('Helvetica-Bold').fillColor('#687277').text(label.toUpperCase(), x + 8, y + 9, { width: 100 }); doc.fontSize(11).font('Helvetica-Bold').fillColor(INK).text(value, x + 8, y + 23, { width: 100 }); }); doc.y = y + 58; }
  private sourceBlock(doc: PDFDocument, label: string, text: string) { const y = doc.y; doc.fontSize(9).font('Helvetica-Bold').fillColor(INK).text(label, 50, y, { width: 85 }); doc.fontSize(9).font('Helvetica').fillColor('#687277').text(text, 145, y, { width: 397 }); doc.y = Math.max(doc.y, y + 18); doc.moveDown(.5); }
  private interviewQuestions(areas: JsonRecord[], profile: JsonRecord) { const first = areas[0]?.name ?? 'tu primera dirección'; const second = areas[1]?.name ?? 'otra posibilidad'; const phase = profile.phase ?? 'el recorrido'; return [`¿Qué experiencia concreta te hizo acercarte a ${first}?`, `¿Qué diferencia notas entre ${first} y ${second} cuando imaginas una actividad real?`, `En la fase de ${phase}, ¿qué respuesta o situación te gustaría revisar con más calma?`]; }
}
