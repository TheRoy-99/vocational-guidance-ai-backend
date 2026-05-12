/**
 * Motor de recomendaciones de carreras basado en respuestas del cuestionario CHASIDE
 * Utiliza lógica heurística para mapear respuestas a carreras y fortalezas
 */

export interface RecommendationResult {
  topCareers: CareerRecommendation[];
  compatibility: CareerCompatibility[];
  strengths: StrengthAssessment[];
  analysis: string;
}

export interface CareerRecommendation {
  name: string;
  score: number;
  color: string;
  description: string;
}

export interface CareerCompatibility {
  career: string;
  score: number;
  reasons: string[];
}

export interface StrengthAssessment {
  subject: string;
  value: number;
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).join(" ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeList(item));
  }

  const text = normalizeText(value).trim();
  if (!text) {
    return [];
  }

  return [text];
}

function includesAny(source: string[], candidates: string[]): boolean {
  const normalizedSource = source.map((item) => item.toLowerCase());
  return candidates.some((candidate) =>
    normalizedSource.some((item) => item.includes(candidate.toLowerCase())),
  );
}

// Para agregar una carrera nueva:
// 1. Añádela en CAREER_KEYWORDS con las materias/intereses que la favorecen.
// 2. Añádela en CAREERS_METADATA para nombre, color y descripción.
// 3. Si quieres sesgos o boosts especiales, ajusta analyzeAnswers() abajo.
// Mapeo de respuestas a palabras clave para scoring
const CAREER_KEYWORDS: Record<string, Record<string, number>> = {
  "Ingeniería de Sistemas": {
    "Analizarlo paso a paso": 20,
    "Analizar paso a paso": 20,
    "Matemáticas": 30,
    "Álgebra": 25,
    "Geometría": 20,
    "Estadística": 20,
    "Física": 25,
    "Química": 10,
    "Tecnología e informática": 25,
    "Informática": 20,
    "tecnología": 25,
    "Tecnología": 20,
    "Programación": 30,
    "Datos y análisis": 20,
    "Ciberseguridad": 20,
    "Inteligencia artificial": 20,
    "innovador": 15,
    "liderazgo": 10,
    "Ciencias exactas": 20,
    "equipo": 10,
  },
  "Diseño UX/UI": {
    "Probar ideas nuevas": 10,
    "Artística": 25,
    "Educación artística": 20,
    "Dibujo": 20,
    "Dibujo técnico": 15,
    "Inglés": 10,
    "Lengua castellana": 10,
    "Tecnología e informática": 15,
    "tecnología": 15,
    "Arte y diseño": 25,
    "Dibujar": 15,
    "Creatividad": 25,
    "Branding": 20,
    "Contenido audiovisual": 20,
    "Ilustración": 20,
    "Artes y diseño": 20,
    "equipo": 10,
  },
  "Psicología": {
    "Explicarlo a otra persona": 10,
    "Filosofía": 15,
    "Ética y valores": 15,
    "Ciencias sociales": 25,
    "Sociales": 20,
    "Biología": 15,
    "Lengua castellana": 10,
    "Lectura crítica": 15,
    "Ayudar a otros": 25,
    "Ayudar a otras personas": 25,
    "Bienestar y acompañamiento": 20,
    "Salud comunitaria": 20,
    "Psicología": 25,
    "equipo": 15,
  },
  "Marketing": {
    "Inglés": 15,
    "Lengua castellana": 15,
    "Comunicación": 20,
    "Ciencias sociales": 10,
    "Estadística": 10,
    "Creatividad": 15,
    "Negocios": 20,
    "Emprendimiento": 25,
    "Ganar bien": 15,
    "liderazgo": 15,
    "equipo": 15,
  },
  "Economía": {
    "Ganar bien y tener estabilidad": 25,
    "Matemáticas": 25,
    "Estadística": 25,
    "Ciencias sociales": 15,
    "Filosofía": 10,
    "Negocios": 20,
    "Emprendimiento": 10,
    "liderazgo": 15,
    "Análisis": 15,
    "Finanzas": 20,
    "Contabilidad": 25,
    "Ciencias exactas": 15,
  },
  "Educación": {
    "Lengua castellana": 20,
    "Literatura": 20,
    "Inglés": 15,
    "Ciencias sociales": 15,
    "Historia": 15,
    "Filosofía": 10,
    "Artística": 10,
    "Ayudar a otros": 25,
    "Ayudar a otras personas": 25,
    "Humanidades": 20,
    "Leer": 15,
    "Comunicación": 15,
    "equipo": 10,
  },
  "Arquitectura": {
    "Proyectos experimentales": 20,
    "Matemáticas": 25,
    "Geometría": 25,
    "Física": 20,
    "Dibujo técnico": 25,
    "Tecnología e informática": 15,
    "Artística": 10,
    "Artes y diseño": 25,
    "Dibujar": 20,
    "tecnología": 10,
  },
  "Administración de Empresas": {
    "Matemáticas": 20,
    "Estadística": 20,
    "Contabilidad": 25,
    "Economía": 20,
    "Emprendimiento": 20,
    "Tecnología e informática": 10,
    "liderazgo": 20,
    "Ganar bien": 20,
    "Negocios": 25,
    "equipo": 15,
    "Gestión de proyectos": 20,
  },
  "Contaduría": {
    "Matemáticas": 30,
    "Estadística": 25,
    "Economía": 20,
    "Contabilidad": 40,
    "Finanzas": 30,
    "Tecnología e informática": 10,
    "Ética y valores": 10,
    "Emprendimiento": 10,
  },
  "Salud": {
    "Biología": 30,
    "Química": 20,
    "Cuidado": 25,
    "Salud": 35,
    "Atención a personas": 25,
    "Trabajo social": 15,
    "Bienestar": 20,
  },
  "Derecho": {
    "Derecho": 35,
    "Justicia": 25,
    "Lectura crítica": 25,
    "Historia": 15,
    "Ciencias sociales": 15,
    "Debate": 15,
  },
  "Idiomas": {
    "Idiomas": 40,
    "Inglés": 30,
    "Lengua castellana": 20,
    "Comunicación": 25,
    "Traducción": 15,
    "Literatura": 15,
  },
};

const CAREERS_METADATA: Record<
  string,
  { color: string; description: string }
> = {
  "Ingeniería de Sistemas": {
    color: "from-purple-500 to-pink-500",
    description:
      "Desarrollo de software, sistemas y soluciones tecnológicas innovadoras",
  },
  "Diseño UX/UI": {
    color: "from-blue-500 to-cyan-500",
    description: "Diseño de interfaces y experiencias de usuario digitales",
  },
  Psicología: {
    color: "from-green-500 to-emerald-500",
    description: "Salud mental, investigación y apoyo psicológico",
  },
  Marketing: {
    color: "from-yellow-500 to-orange-500",
    description: "Estrategias comerciales, branding y comunicación digital",
  },
  Economía: {
    color: "from-red-500 to-pink-500",
    description: "Análisis económico, finanzas y gestión empresarial",
  },
  Educación: {
    color: "from-cyan-500 to-blue-500",
    description: "Docencia, pedagogía y formación de nuevas generaciones",
  },
  Arquitectura: {
    color: "from-indigo-500 to-purple-500",
    description: "Diseño y construcción de espacios e infraestructuras",
  },
  "Administración de Empresas": {
    color: "from-pink-500 to-rose-500",
    description: "Gestión empresarial, estrategia y liderazgo organizacional",
  },
  "Contaduría": {
    color: "from-yellow-600 to-amber-500",
    description: "Contabilidad, auditoría e impuestos — gestión financiera de organizaciones",
  },
  "Salud": {
    color: "from-green-600 to-emerald-500",
    description: "Profesiones de la salud: enfermería, salud pública, acompañamiento y cuidado",
  },
  "Derecho": {
    color: "from-indigo-600 to-violet-500",
    description: "Estudio del derecho, litigio, asesoría legal y políticas públicas",
  },
  "Idiomas": {
    color: "from-amber-500 to-yellow-400",
    description: "Estudios en lenguas, traducción, enseñanza de idiomas y comunicación internacional",
  },
};

/**
 * Analiza las respuestas del cuestionario y genera recomendaciones
 * @param answers Objeto con las respuestas indexadas por ID de pregunta
 * @returns Objeto con recomendaciones de carreras, compatibilidades y fortalezas
 */
export function analyzeAnswers(answers: Record<number, any>): RecommendationResult {
  const age = Number(answers[1] || 0);
  const grade = normalizeText(answers[2]);
  const interests = normalizeList(answers[3]);
  const favoriteSubjects = normalizeList(answers[4]);
  const hobbies = normalizeList(answers[5]);
  const goals = normalizeText(answers[6]);

  // Afinidad cognitiva
  const thinkingStyle = normalizeText(answers[7]);
  const coreStrength = normalizeText(answers[8]);

  // Preferencias profesionales
  const professionalArea = normalizeText(answers[9]);
  const workEnvironment = normalizeText(answers[10]);

  // Comportamiento y motivación
  const resilience = Number(answers[11] || 3);

  // IA adaptativa
  const adaptiveExploration = normalizeText(answers[12]);

  const ageContext = age > 0
    ? age < 15
      ? "educación secundaria"
      : age < 18
        ? "bachillerato"
        : age < 25
          ? "formación superior"
          : "etapa profesional"
    : "perfil general";

  // Crear string combinado de respuestas para búsqueda de keywords
  const responseText = [
    thinkingStyle,
    coreStrength,
    professionalArea,
    workEnvironment,
    adaptiveExploration,
    grade,
    goals,
    interests.join(" "),
    favoriteSubjects.join(" "),
    hobbies.join(" "),
    ageContext,
  ]
    .join(" ")
    .toLowerCase();

  // Calcular scores para cada carrera
  const careerScores: Record<string, number> = {};

  Object.entries(CAREER_KEYWORDS).forEach(([career, keywords]) => {
    let score = 0;

    // Buscar coincidencias de palabras clave
    Object.entries(keywords).forEach(([keyword, weight]) => {
      const normalizedKeyword = keyword.toLowerCase();
      const keywordCount = (responseText.match(new RegExp(normalizedKeyword, "g")) || [])
        .length;
      score += keywordCount * weight;
    });

    // Ajustar score basado en tech comfort (para carreras tech)
    if (
      ["Ingeniería de Sistemas", "Diseño UX/UI"].includes(career) &&
      (professionalArea.toLowerCase().includes("tecnolog") || resilience >= 4)
    ) {
      score += 15;
    }
    if (
      ["Psicología", "Educación"].includes(career) &&
      (professionalArea.toLowerCase().includes("salud") || workEnvironment.toLowerCase().includes("person"))
    ) {
      score += 15;
    }

    if (
      career === "Ingeniería de Sistemas" &&
      (includesAny(interests, ["Tecnología", "Ciencias"]) ||
        includesAny(favoriteSubjects, ["Matemáticas", "Física", "Programación"]) ||
        includesAny(hobbies, ["Programar", "Investigar cosas nuevas"]) ||
        thinkingStyle.toLowerCase().includes("analizar") ||
        coreStrength.toLowerCase().includes("lógica") ||
        adaptiveExploration.toLowerCase().includes("programación") ||
        adaptiveExploration.toLowerCase().includes("datos"))
    ) {
      score += 15;
    }

    if (
      career === "Diseño UX/UI" &&
      (includesAny(interests, ["Arte y diseño"]) ||
        includesAny(favoriteSubjects, ["Arte"]) ||
        includesAny(hobbies, ["Dibujar"]) ||
        thinkingStyle.toLowerCase().includes("creativ") ||
        coreStrength.toLowerCase().includes("creativ") ||
        adaptiveExploration.toLowerCase().includes("diseño"))
    ) {
      score += 15;
    }

    if (
      career === "Psicología" &&
      (includesAny(interests, ["Salud", "Ayudar a otras personas"]) ||
        includesAny(hobbies, ["Ayudar a otras personas"]) ||
        professionalArea.toLowerCase().includes("salud") ||
        workEnvironment.toLowerCase().includes("person") ||
        adaptiveExploration.toLowerCase().includes("psicología"))
    ) {
      score += 15;
    }

    if (
      ["Marketing", "Administración de Empresas", "Economía"].includes(career) &&
      (includesAny(interests, ["Negocios", "Emprendimiento"]) ||
        includesAny(favoriteSubjects, ["Economía"]) ||
        includesAny(hobbies, ["Emprender proyectos"]) ||
        professionalArea.toLowerCase().includes("negocio") ||
        workEnvironment.toLowerCase().includes("emprend") ||
        adaptiveExploration.toLowerCase().includes("emprendimiento"))
    ) {
      score += 15;
    }

    if (
      career === "Educación" &&
      (includesAny(interests, ["Idiomas", "Ayudar a otras personas"]) ||
        includesAny(favoriteSubjects, ["Lengua y literatura", "Historia"]) ||
        includesAny(hobbies, ["Leer"]) ||
        workEnvironment.toLowerCase().includes("person") ||
        adaptiveExploration.toLowerCase().includes("educación"))
    ) {
      score += 15;
    }

    if (
      career === "Arquitectura" &&
      (includesAny(interests, ["Arte y diseño"]) ||
        includesAny(favoriteSubjects, ["Arte", "Matemáticas"]) ||
        includesAny(hobbies, ["Dibujar"]) ||
        adaptiveExploration.toLowerCase().includes("ilustr") ||
        adaptiveExploration.toLowerCase().includes("proyecto"))
    ) {
      score += 15;
    }

    // Salud
    if (
      career === "Salud" &&
      (includesAny(interests, ["Salud", "Ayudar a otras personas"]) ||
        includesAny(favoriteSubjects, ["Biología", "Química"]) ||
        includesAny(hobbies, ["Cuidar personas"]) ||
        professionalArea.toLowerCase().includes("salud") ||
        adaptiveExploration.toLowerCase().includes("salud") ||
        adaptiveExploration.toLowerCase().includes("enfermer"))
    ) {
      score += 18;
    }

    // Derecho
    if (
      career === "Derecho" &&
      (includesAny(interests, ["Derecho", "Justicia", "Debate"]) ||
        includesAny(favoriteSubjects, ["Historia", "Lengua y literatura"]) ||
        coreStrength.toLowerCase().includes("lectura") ||
        professionalArea.toLowerCase().includes("derech") ||
        adaptiveExploration.toLowerCase().includes("derecho"))
    ) {
      score += 16;
    }

    // Idiomas
    if (
      career === "Idiomas" &&
      (includesAny(interests, ["Idiomas", "Lenguas"]) ||
        includesAny(favoriteSubjects, ["Lengua y literatura", "Inglés"]) ||
        includesAny(hobbies, ["Leer", "Escribir"]) ||
        professionalArea.toLowerCase().includes("inglés") ||
        adaptiveExploration.toLowerCase().includes("idioma"))
    ) {
      score += 16;
    }

    // Detectar señales de perfil contable/financiero para favorecer Economía/Administración/Contaduría
    const accountingMatch = (
      includesAny(interests, ["Contaduría", "Contabilidad", "Finanzas", "Números", "Impuestos"]) ||
      includesAny(favoriteSubjects, ["Contaduría", "Contabilidad", "Finanzas"]) ||
      includesAny(hobbies, ["Llevar cuentas", "Analizar gastos", "Presupuestar"]) ||
      professionalArea.toLowerCase().includes("contad") ||
      adaptiveExploration.toLowerCase().includes("contab") ||
      adaptiveExploration.toLowerCase().includes("finanzas")
    );

    if (accountingMatch) {
      if (["Economía", "Administración de Empresas", "Contaduría"].includes(career)) {
        score += 30; // boost fuerte para perfiles contables
      }

      // Evitar sesgo hacia ingeniería cuando el usuario muestra señales contables
      if (career === "Ingeniería de Sistemas") {
        score = Math.max(score - 30, 0);
      }
    }

    // Normalizar score a 0-100
    careerScores[career] = Math.min(Math.max(score, 10), 100);
  });

  // Ordenar carreras por score
  const sortedCareers = Object.entries(careerScores)
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice(0, 5); // Top 5

  // Construir recomendaciones
  const topCareers: CareerRecommendation[] = sortedCareers.map(([career, score]) => ({
    name: career,
    score: Math.round(score),
    color: CAREERS_METADATA[career]?.color || "from-gray-500 to-gray-600",
    description: CAREERS_METADATA[career]?.description || "",
  }));

  // Generar compatibilidades con razones
  const compatibility: CareerCompatibility[] = sortedCareers.map(
    ([career, score]) => {
      const reasons: string[] = [];

      // Agregar razones basadas en respuestas
      if (
        (thinkingStyle.toLowerCase().includes("analiz") || coreStrength.toLowerCase().includes("lógica")) &&
        CAREER_KEYWORDS[career]?.["Análisis"]
      ) {
        reasons.push("Tu capacidad para resolver problemas");
      }
      if (
        (thinkingStyle.toLowerCase().includes("creativ") || coreStrength.toLowerCase().includes("creativ")) &&
        CAREER_KEYWORDS[career]?.["Creatividad"]
      ) {
        reasons.push("Tu creatividad demostrada");
      }
      if (
        (professionalArea.toLowerCase().includes("salud") || workEnvironment.toLowerCase().includes("person")) &&
        CAREER_KEYWORDS[career]?.["Ayudar a otras personas"]
      ) {
        reasons.push("Tu orientación hacia ayudar a otros");
      }
      if (
        career === "Derecho" &&
        (coreStrength.toLowerCase().includes("lectura") || coreStrength.toLowerCase().includes("análisis") ||
          CAREER_KEYWORDS[career]?.["Lectura crítica"]) 
      ) {
        reasons.push("Tu capacidad de análisis crítico y lectura densa");
      }
      if (
        career === "Idiomas" &&
        (coreStrength.toLowerCase().includes("comunic") || CAREER_KEYWORDS[career]?.["Idiomas"]) 
      ) {
        reasons.push("Tu habilidad para comunicarte y manejar lenguas");
      }
      if (
        (professionalArea.toLowerCase().includes("tecnolog") || adaptiveExploration.toLowerCase().includes("datos")) &&
        CAREER_KEYWORDS[career]?.["tecnología"]
      ) {
        reasons.push("Tu comodidad con la tecnología");
      }
      if (workEnvironment.toLowerCase().includes("equipo") && CAREER_KEYWORDS[career]?.["equipo"]) {
        reasons.push("Tu preferencia por trabajo en equipo");
      }

      if (reasons.length === 0) {
        reasons.push("Buena compatibilidad general con tus intereses");
      }

      return {
        career,
        score: Math.round(score),
        reasons,
      };
    }
  );

  // Calcular fortalezas detectadas
  const strengths = detectStrengths(
    age,
    grade,
    interests,
    favoriteSubjects,
    hobbies,
    goals,
    thinkingStyle,
    coreStrength,
    professionalArea,
    workEnvironment,
    resilience,
    adaptiveExploration
  );

  // Generar análisis narrativo
  const analysis = generateAnalysis(
    age,
    grade,
    interests,
    favoriteSubjects,
    hobbies,
    goals,
    thinkingStyle,
    coreStrength,
    professionalArea,
    workEnvironment,
    resilience,
    adaptiveExploration,
    topCareers,
  );

  return {
    topCareers,
    compatibility,
    strengths,
    analysis,
  };
}

/**
 * Detecta fortalezas basadas en las respuestas
 */
function detectStrengths(
  age: number,
  grade: string,
  interests: string[],
  favoriteSubjects: string[],
  hobbies: string[],
  goals: string,
  thinkingStyle: string,
  coreStrength: string,
  professionalArea: string,
  workEnvironment: string,
  resilience: number,
  adaptiveExploration: string
): StrengthAssessment[] {
  const strengths: StrengthAssessment[] = [];

  // Pensamiento lógico
  let logicalValue = 50;
  if (thinkingStyle.toLowerCase().includes("analiz") || thinkingStyle.toLowerCase().includes("datos")) logicalValue += 30;
  if (coreStrength.toLowerCase().includes("lógica") || coreStrength.toLowerCase().includes("análisis")) logicalValue += 20;
  if (professionalArea.toLowerCase().includes("tecnolog") || adaptiveExploration.toLowerCase().includes("datos")) logicalValue += 15;
  if (includesAny(interests, ["Tecnología", "Ciencias"])) logicalValue += 10;
  if (includesAny(favoriteSubjects, ["Matemáticas", "Física", "Programación"])) logicalValue += 10;
  if (resilience >= 4) logicalValue += 5;
  strengths.push({
    subject: "Pensamiento lógico",
    value: Math.min(logicalValue, 100),
  });

  // Creatividad
  let creativityValue = 50;
  if (thinkingStyle.toLowerCase().includes("creativ") || coreStrength.toLowerCase().includes("creativ")) creativityValue += 35;
  if (professionalArea.toLowerCase().includes("arte") || adaptiveExploration.toLowerCase().includes("diseño")) creativityValue += 20;
  if (includesAny(interests, ["Arte y diseño"])) creativityValue += 15;
  if (includesAny(hobbies, ["Dibujar", "Música"])) creativityValue += 10;
  strengths.push({
    subject: "Creatividad",
    value: Math.min(creativityValue, 100),
  });

  // Comunicación
  let communicationValue = 50;
  if (thinkingStyle.toLowerCase().includes("explic") || coreStrength.toLowerCase().includes("comunic")) communicationValue += 30;
  if (workEnvironment.toLowerCase().includes("person")) communicationValue += 15;
  if (includesAny(interests, ["Idiomas", "Ayudar a otras personas"])) communicationValue += 10;
  strengths.push({
    subject: "Comunicación",
    value: Math.min(communicationValue, 100),
  });

  // Trabajo en equipo
  let teamValue = 50;
  if (workEnvironment.toLowerCase().includes("equipo") || workEnvironment.toLowerCase().includes("person")) teamValue += 25;
  if (resilience >= 4) teamValue += 10;
  if (includesAny(interests, ["Ayudar a otras personas"])) teamValue += 10;
  strengths.push({
    subject: "Trabajo en equipo",
    value: Math.min(teamValue, 100),
  });

  // Liderazgo
  let leadershipValue = 50;
  if (coreStrength.toLowerCase().includes("lider") || workEnvironment.toLowerCase().includes("emprend")) leadershipValue += 35;
  if (includesAny(interests, ["Emprendimiento", "Negocios"])) leadershipValue += 10;
  if (resilience >= 4) leadershipValue += 10;
  strengths.push({
    subject: "Liderazgo",
    value: Math.min(leadershipValue, 100),
  });

  // Análisis
  let analysisValue = 50;
  if (thinkingStyle.toLowerCase().includes("analiz") || coreStrength.toLowerCase().includes("análisis")) analysisValue += 25;
  if (professionalArea.toLowerCase().includes("investig") || adaptiveExploration.toLowerCase().includes("datos")) analysisValue += 20;
  if (grade.toLowerCase().includes("univers") || grade.toLowerCase().includes("técnic"))
    analysisValue += 20;
  if (includesAny(interests, ["Investigación", "Ciencias"])) analysisValue += 10;
  if (includesAny(favoriteSubjects, ["Matemáticas", "Física", "Economía"])) analysisValue += 10;
  if (resilience >= 4) analysisValue += 5;
  strengths.push({
    subject: "Análisis",
    value: Math.min(analysisValue, 100),
  });

  // Orientación y enfoque profesional
  let orientationValue = 50;
  if (age > 0) orientationValue += age < 18 ? 10 : 0;
  if (grade.toLowerCase().includes("univers")) orientationValue += 10;
  if (goals.toLowerCase().includes("univers")) orientationValue += 10;
  if (goals.toLowerCase().includes("emprend")) orientationValue += 10;
  if (adaptiveExploration.toLowerCase().includes("programación") || adaptiveExploration.toLowerCase().includes("diseño")) orientationValue += 10;
  strengths.push({
    subject: "Orientación profesional",
    value: Math.min(orientationValue, 100),
  });

  return strengths;
}

/**
 * Genera un análisis narrativo personalizado
 */
function generateAnalysis(
  age: number,
  grade: string,
  interests: string[],
  favoriteSubjects: string[],
  hobbies: string[],
  goals: string,
  thinkingStyle: string,
  coreStrength: string,
  professionalArea: string,
  workEnvironment: string,
  resilience: number,
  adaptiveExploration: string,
  topCareers: CareerRecommendation[]
): string {
  const topCareer = topCareers[0]?.name || "carreras variadas";
  let analysis =
    `Basado en tus respuestas, hemos identificado un perfil vocacional orientado hacia ${topCareer}. `;

  if (age > 0 || grade.trim()) {
    analysis += `Tu perfil inicial indica ${age > 0 ? `${age} años` : "una edad por definir"}${grade.trim() ? ` y un nivel de estudio en ${grade}` : ""}. `;
  }

  if (interests.length > 0) {
    analysis += `Tus intereses principales apuntan a ${interests.slice(0, 3).join(", ")}. `;
  }

  if (favoriteSubjects.length > 0) {
    analysis += `Las materias que más te atraen son ${favoriteSubjects.slice(0, 3).join(", ")}. `;
  }

  if (hobbies.length > 0) {
    analysis += `En tu tiempo libre disfrutas actividades como ${hobbies.slice(0, 3).join(", ")}. `;
  }

  if (goals.trim()) {
    analysis += `Tu meta a mediano plazo está orientada a ${goals.trim().toLowerCase()}. `;
  }

  if (thinkingStyle.toLowerCase().includes("analiz") || coreStrength.toLowerCase().includes("lógica")) {
    analysis += `Tu capacidad para resolver problemas es una fortaleza notable. `;
  }

  if (coreStrength.toLowerCase().includes("creativ") || professionalArea.toLowerCase().includes("arte")) {
    analysis += `Tu creatividad es un aspecto destacado de tu perfil vocacional. `;
  }

  if (workEnvironment.toLowerCase().includes("person") || professionalArea.toLowerCase().includes("salud")) {
    analysis += `Tu orientación hacia ayudar a otros abre oportunidades en campos como psicología, educación y trabajo social. `;
  }

  if (professionalArea.toLowerCase().includes("tecnolog") || adaptiveExploration.toLowerCase().includes("programación") || adaptiveExploration.toLowerCase().includes("datos")) {
    analysis += `Tu interés en la innovación tecnológica sugiere que prosperarías en roles que permitan construir soluciones concretas. `;
  }

  if (resilience >= 4) {
    analysis += `Tu capacidad para recuperarte ante obstáculos refuerza una base sólida para carreras con retos constantes. `;
  }

  analysis += `Te recomendamos explorar más sobre las carreras sugeridas y considerar internships o experiencias prácticas para validar tu inclinación vocacional.`;

  return analysis;
}
