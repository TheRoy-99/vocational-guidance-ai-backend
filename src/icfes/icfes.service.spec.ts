import { IcfesService } from './icfes.service';

describe('IcfesService · auditoría de lectura Saber 11', () => {
  it('extrae exactamente el caso controlado sin alterar cifras', () => {
    const service = new IcfesService({} as never);
    const report = service.auditParserContract();

    expect(report.status).toBe('pass');
    expect(report.extracted.globalScore).toBe(342);
    expect(report.extracted.globalPercentile).toBe(71);
    expect(report.extracted.subjectScores).toEqual([
      { subject: 'Lectura Crítica', score: 78, percentile: 73 },
      { subject: 'Matemáticas', score: 64, percentile: 58 },
      { subject: 'Sociales y Ciudadanas', score: 70, percentile: 66 },
      { subject: 'Ciencias Naturales', score: 81, percentile: 82 },
      { subject: 'Inglés', score: 55, percentile: 49 },
    ]);
  });
});
