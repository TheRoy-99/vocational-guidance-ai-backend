# ORIENTA AI — Backend

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

Backend para el sistema de orientación vocacional **ORIENTA**, impulsado por Inteligencia Artificial mediante el test CHASIDE.

---

## Tech Stack

| Capa | Tecnología |
|---|---|
| Framework | NestJS + TypeScript |
| Base de datos | PostgreSQL (Prisma ORM v7) |
| Autenticación | JWT (Passport) |
| Cola de trabajos | BullMQ + Redis |
| Inteligencia Artificial | Groq API (Llama 3.3 70B) — reemplazable por Claude |
| Infraestructura local | Docker + Docker Compose |

---

## Arquitectura

El proyecto sigue **Arquitectura Hexagonal con Domain-Driven Design**, dividido en módulos con responsabilidad única:

```
AppModule
├── PrismaModule     → acceso global a PostgreSQL
├── AuthModule       → registro, login, JWT
├── UsersModule      → CRUD de usuarios
└── ChasideModule    → motor de inferencia vocacional
    ├── ChasideController      → endpoints HTTP
    ├── ChasideService         → orquesta flujo y DB
    ├── ChasideScoringService  → algoritmo matemático CHASIDE
    ├── ChasideAiService       → integración Groq/Claude
    └── ChasideProcessor       → worker BullMQ
```

### Reglas de ingeniería
- **Cero lógica de negocio en controladores** — solo reciben DTOs y delegan
- **SRP estricto** — cada servicio tiene una única responsabilidad
- **202 Accepted** para procesos asíncronos (análisis IA)
- **Módulos desacoplados** — cada módulo es independiente

---

## Flujo del Motor CHASIDE

```
POST /chaside/submit
        │
        ▼
  Valida DTO (class-validator)
        │
        ▼
  Guarda en DB → status: PENDING
        │
        ▼
  Encola job en Redis (BullMQ)
        │
        └──→ 202 Accepted { assessmentId }

  [Worker en background]
        │
        ▼
  ScoringService → calcula scores por categoría
        │
        ▼
  AiService → llama a Groq/Claude con scores + contexto
        │
        ▼
  Actualiza DB → status: PROCESSED + resultados

GET /chaside/:id/results → polling del frontend
```

---

## Estructura de Carpetas

```
orienta-backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   │   ├── register.dto.ts
│   │   │   └── login.dto.ts
│   │   └── guards/
│   │       ├── jwt-auth.guard.ts
│   │       └── jwt.strategy.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │       └── update-user.dto.ts
│   └── chaside/
│       ├── chaside.module.ts
│       ├── chaside.controller.ts
│       ├── chaside.service.ts
│       ├── constants/
│       │   └── chaside-data.ts
│       ├── dto/
│       │   └── submit-assessment.dto.ts
│       ├── processors/
│       │   └── chaside.processor.ts
│       └── services/
│           ├── chaside-scoring.service.ts
│           ├── chaside-ai.service.ts
│           └── chaside.service.ts
├── docker-compose.yml
└── .env
```

---

## Instalación y Setup Local

### Prerrequisitos
- Node.js 18+
- Docker Desktop
- Git

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd orienta-backend
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz:

```bash
DATABASE_URL="***REMOVED***ql://tucontraseña:password@localhost:5432/orienta_db"
JWT_SECRET="tu_secret_muy_largo_y_aleatorio"
JWT_EXPIRES_IN="1d"
REDIS_HOST=localhost
REDIS_PORT=6379
GEMINI_API_KEY=tu_api_key_de_gemini
GROQ_API_KEY=gsk_tu_api_key_aqui
PORT=3000
```

> Para obtener la API key de Groq: [console.groq.com](https://console.groq.com) → API Keys → Create API Key

### 3. Levantar infraestructura con Docker

```bash
docker-compose up -d

# Verificar que están corriendo
docker ps
# Debes ver: orienta_***REMOVED*** y orienta_redis
```

### 4. Aplicar migraciones de base de datos

```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Arrancar el servidor

```bash
npm run start:dev
```

El servidor corre en: `http://localhost:3000/api/v1`

---

## Endpoints Disponibles

### Auth

| Método | Endpoint | Auth | Body | Respuesta |
|---|---|---|---|---|
| POST | `/api/v1/auth/register` | ❌ | `{ name, email, password }` | `{ accessToken, user }` |
| POST | `/api/v1/auth/login` | ❌ | `{ email, password }` | `{ accessToken, user }` |

### Users

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/v1/users` | ✅ JWT | Listar todos los usuarios |
| GET | `/api/v1/users/:id` | ✅ JWT | Obtener usuario por ID |
| PATCH | `/api/v1/users/:id` | ✅ JWT | Actualizar usuario |
| DELETE | `/api/v1/users/:id` | ✅ JWT | Eliminar usuario |

### CHASIDE

| Método | Endpoint | Auth | Respuesta | Descripción |
|---|---|---|---|---|
| POST | `/api/v1/chaside/submit` | ✅ JWT | `202 { assessmentId, status }` | Envía respuestas del test |
| GET | `/api/v1/chaside/:id/results` | ✅ JWT | `200 { scores, aiAnalysis, topCareers... }` | Consulta resultados |
| GET | `/api/v1/chaside/my-assessments` | ✅ JWT | `200 [{ id, status, scores, createdAt }]` | Historial del usuario |

---

## Formato del Test CHASIDE

### Categorías de preguntas

| Categoría | Descripción | Tipo |
|---|---|---|
| `C` | Científico | boolean / scale |
| `H` | Humanístico | boolean / scale |
| `A` | Artístico | boolean / scale |
| `S` | Social | boolean / scale |
| `I` | Investigativo | boolean / scale |
| `D` | Dirigente | boolean / scale |
| `E` | Emprendedor | boolean / scale |
| `LOCATION` | Contexto de localización | boolean |
| `INTEREST` | Intereses generales | scale |
| `ACTIVITY` | Actividades en tiempo libre | boolean |
| `ACADEMIC` | Perfil académico | scale |

### Ejemplo de request

```json
POST /api/v1/chaside/submit
Authorization: Bearer <token>

{
  "answers": [
    { "questionId": 1,  "category": "C",        "type": "boolean", "value": 1 },
    { "questionId": 2,  "category": "I",        "type": "boolean", "value": 1 },
    { "questionId": 3,  "category": "INTEREST", "type": "scale",   "value": 4 },
    { "questionId": 4,  "category": "LOCATION", "type": "boolean", "value": 1 }
  ]
}
```

### Ejemplo de respuesta (después de PROCESSED)

```json
{
  "id": "uuid",
  "status": "PROCESSED",
  "scores": { "C": 12, "H": 4, "A": 8, "S": 6, "I": 13, "D": 3, "E": 7 },
  "aiAnalysis": "Análisis narrativo personalizado del perfil...",
  "topCareers": [
    { "career": "Ingeniería de Sistemas", "justification": "..." }
  ],
  "notRecommended": [
    { "career": "Derecho", "reason": "..." }
  ],
  "idealEnvironment": "Laboratorios, empresas de tecnología..."
}
```

### Estados del Assessment

```
PENDING     → Encolado, worker no ha iniciado
PROCESSING  → Worker activo, IA procesando
PROCESSED   → Resultados listos ✅
FAILED      → Falló tras 3 reintentos ❌
```

---

## Integración desde el Frontend (Next.js)

### 1. Login y guardar token

```typescript
const res = await fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
const { accessToken } = await res.json()
localStorage.setItem('token', accessToken)
```

### 2. Enviar respuestas del test

```typescript
const res = await fetch('http://localhost:3000/api/v1/chaside/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  },
  body: JSON.stringify({ answers })
})
const { assessmentId } = await res.json() // 202 Accepted
```

### 3. Polling hasta que la IA termine

```typescript
const pollResults = (assessmentId: string) => {
  const interval = setInterval(async () => {
    const res = await fetch(`http://localhost:3000/api/v1/chaside/${assessmentId}/results`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    const data = await res.json()

    if (data.status === 'PROCESSED') {
      clearInterval(interval)
      // redirigir a pantalla de resultados con data
    }

    if (data.status === 'FAILED') {
      clearInterval(interval)
      // mostrar error al usuario
    }
  }, 3000) // polling cada 3 segundos
}
```

---

## Git Flow

```
main        → producción (solo releases estables)
develop     → integración (base de todas las features)
feature/*   → desarrollo de funcionalidades
```

### Ramas actuales
- `feature/auth-and-users-base` →  mergeada a develop
- `feature/chaside-engine` → no esta mergeada a develop

---

## Estado del Proyecto

| Módulo | Estado |
|---|---|
| Auth (registro, login, JWT)
| Users (CRUD)
| CHASIDE engine (scoring)
| Integración IA (Groq) 
| Cola asíncrona (BullMQ)
---

## Variables de Entorno Requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexión PostgreSQL | `***REMOVED***ql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | Secret para firmar tokens JWT | string largo y aleatorio |
| `JWT_EXPIRES_IN` | Expiración del token | `7d` |
| `REDIS_HOST` | Host de Redis | `localhost` |
| `REDIS_PORT` | Puerto de Redis | `6379` |
| `GEMINI_API_KEY` | API key de Gemini (proveedor principal de IA) | `AIza...` |
| `GEMINI_MODEL` | Modelo de Gemini (opcional) | `gemini-3.8-flash` |
| `GROQ_API_KEY` | API key de Groq (opcional, respaldo cuando Gemini falla) | `gsk_...` |
| `GROQ_MODEL` | Modelo de Groq (opcional) | `openai/gpt-oss-20b` |
| `FRONTEND_URL` | URL del frontend: origen permitido por CORS y base del enlace para restablecer la contraseña | `https://...` |
| `SMTP_USER` | Correo que envía el enlace de "olvidé mi contraseña" | `tu_correo@gmail.com` |
| `SMTP_PASS` | Contraseña de aplicación de Gmail (no la contraseña normal) | Las 16 letras que genera Google |
| `SMTP_HOST` / `SMTP_PORT` | Servidor SMTP (opcional, por defecto Gmail) | `smtp.gmail.com` / `465` |
| `MAIL_FROM` | Remitente que ve el usuario (opcional) | `OrientaAI <tu_correo@gmail.com>` |
| `PORT` | Puerto del servidor | `3000` |

---

## Auditoría reproducible y garantías de interpretación

El backend expone una verificación pública y sintética en:

```text
GET /api/audit/verification
```

En esta versión el prefijo configurado por la aplicación es `/api`. El endpoint no requiere autenticación y no utiliza datos de usuarios: devuelve únicamente evidencia controlada para la demostración. El frontend la presenta en `/audit` junto con la auditoría del motor adaptativo.

### Tres verificaciones principales

1. **Reproducibilidad y estabilidad del motor.** `career-engine.stability.spec.ts` comprueba la normalización de texto, la invariancia ante tildes, la deduplicación de palabras clave, el resultado determinista en 100 ejecuciones y el desempate canónico. El frontend complementa esto recorriendo el flujo adaptativo completo y revisando preguntas, fases, ruta y ranking.

2. **Exactitud del lector ICFES Saber 11.** `IcfesService.auditParserContract()` procesa un caso controlado con valores conocidos y exige coincidencia exacta del puntaje global, percentil y cinco áreas. También rechaza valores fuera de rango: 0–500 para el global y 0–100 para percentiles y áreas. Esta comprobación es un contrato de regresión; no significa que todos los formatos futuros de PDF estén cubiertos.

3. **Interpretación de IA sin alterar puntajes.** `ChasideAiService` aplica el contrato `ai-guardrails-v1`: fidelidad numérica exacta, anclaje a evidencia, aislamiento XML (`<verified_student_data>` y `<user_query>`), confidencialidad contra prompt-leakage/jailbreak y frontera vocacional sin diagnósticos clínicos. La temperatura se fija en `0.2` para reducir variación y se valida la respuesta: si contiene un número no presente en los datos verificados, se usa una respuesta segura de respaldo.

### Cómo ejecutar las verificaciones

Desde `vocational-guidance-ai-backend/`:

```bash
npx tsc --noEmit
npx jest src/icfes/icfes.service.spec.ts src/chaside/services/chaside-ai.service.spec.ts src/assessments/utils/career-engine.stability.spec.ts --runInBand
```

La prueba de IA verifica tanto las directivas presentes en el prompt como el rechazo de una alteración numérica. La prueba ICFES compara los valores esperados con los valores extraídos, y la prueba del motor repite el cálculo para comprobar estabilidad.

### Evidencia, trazabilidad y límites

- La ruta pública reporta el estado de cada contrato, su evidencia y la versión de las garantías de IA, sin exponer prompts privados, claves ni información personal.
- El endpoint ICFES utiliza un documento controlado. Para una conclusión más amplia se debe agregar un corpus de PDFs reales anonimizados y casos de regresión por formato.
- La temperatura baja la variabilidad, pero un LLM no es la fuente matemática de los resultados. Los puntajes deben provenir del motor o del lector verificado.
- El filtro numérico evita que una respuesta con cifras no verificadas llegue al usuario, aunque no reemplaza una revisión humana de calidad conversacional.
- Nada de lo anterior constituye por sí solo validación psicométrica: siguen siendo necesarias pruebas con participantes, test-retest, validez de constructo y revisión metodológica independiente.

Archivos principales de la auditoría:

```text
src/audit/audit.controller.ts
src/assessments/utils/career-engine.stability.spec.ts
src/icfes/icfes.service.spec.ts
src/chaside/services/chaside-ai.service.spec.ts
src/chaside/services/chaside-ai.service.ts
```
