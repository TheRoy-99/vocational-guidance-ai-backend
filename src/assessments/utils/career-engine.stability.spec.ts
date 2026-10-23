import { analyzeAnswers, canonicalizeText } from './career-engine';

describe('Auditoría de estabilidad del motor heurístico', () => {
  const answers = {
    1: 17,
    2: 'Grado 11',
    3: ['Tecnología', 'Ciencias'],
    4: ['Matemáticas', 'Física'],
    5: ['Programar', 'Investigar cosas nuevas'],
    6: 'Ingresar a la universidad',
    7: 'Analizar paso a paso',
    8: 'Pensamiento lógico',
    9: 'Tecnología e Informática',
    10: 'Trabajo en equipo',
    11: 4,
    12: 'Programación y computación',
  };

  it('normaliza mayúsculas y diacríticos de forma canónica', () => {
    expect(canonicalizeText('MATEMÁTICAS')).toBe('matematicas');
    expect(canonicalizeText('tecnología')).toBe('tecnologia');
  });

  it('es determinista con la misma entrada', () => {
    const first = analyzeAnswers(answers);
    for (let index = 0; index < 100; index += 1) {
      expect(analyzeAnswers(answers)).toEqual(first);
    }
  });

  it('mantiene el mismo resultado ante la ausencia de tildes', () => {
    const accented = analyzeAnswers(answers);
    const unaccented = analyzeAnswers({
      ...answers,
      3: ['Tecnologia', 'Ciencias'],
      4: ['Matematicas', 'Fisica'],
      8: 'Pensamiento logico',
      12: 'Programacion y computacion',
    });
    expect(unaccented.topCareers).toEqual(accented.topCareers);
  });
});
