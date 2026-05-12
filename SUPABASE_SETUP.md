# Migración a Supabase

## 📋 Pasos para conectar a Supabase

### 1. **Crear proyecto en Supabase**
   - Ve a https://supabase.com/
   - Crea una nueva proyecto
   - Copia las credenciales:
     - **Project URL**: `https://YOUR_PROJECT_ID.supabase.co`
     - **Database Password**: usado para conexión
     - **Project ID**: parte de la URL

### 2. **Construir connection string**
   Formato PostgreSQL:
   ```
   postgresql://postgres:[PASSWORD]@[PROJECT_ID].supabase.co:5432/postgres
   ```
   
   Ejemplo (REEMPLAZA CON TUS VALORES REALES):
   ```
   postgresql://postgres:YOUR_SECURE_PASSWORD_HERE@your_project_id.supabase.co:5432/postgres
   ```

### 3. **Actualizar `.env`**
   Reemplaza en `.env`:
   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_PROJECT_ID.supabase.co:5432/postgres"
   JWT_SECRET="tu_secret_muy_largo"
   JWT_EXPIRES_IN="7d"
   PORT=3001
   GROQ_API_KEY="tu_groq_key"
   FRONTEND_URL="http://localhost:3000"
   ```

### 4. **Sincronizar schema a Supabase**
   ```bash
   npm run db:push
   ```
   O si prefieres usar migraciones:
   ```bash
   npm run db:migrate
   ```

### 5. **Exportar datos de PostgreSQL local**
   Si tienes datos locales que migrar:
   ```bash
   npm run migrate:supabase
   ```
   
   Esto:
   - Exportará todos los datos de `localhost:5433` a un archivo JSON
   - Insertará automáticamente en Supabase
   - Generará un log en `migrations/export-[timestamp].json`

### 6. **Verificar conexión**
   ```bash
   npm run start:dev
   ```
   Si ves logs normales sin errores de conexión, ¡está funcionando!

### 7. **Frontend - Actualizar si usas Supabase client**
   Si el frontend necesita conectarse directamente a Supabase:
   ```bash
   npm install @supabase/supabase-js
   ```
   
   En el frontend, agrega a `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

## 🔑 Variables de entorno que necesitas obtener

| Variable | Dónde obtenerla | Ejemplo |
|----------|-----------------|---------|
| `DATABASE_URL` | Supabase Dashboard → Settings → Database | `postgresql://postgres:pass@xyz.supabase.co:5432/postgres` |
| `JWT_SECRET` | Generar aleatorio (min 32 caracteres) | `aB3xY9kL2mN5pQ8rS1tU4vW7xY0zC3` |
| `GROQ_API_KEY` | https://console.groq.com/ | `gsk_...` |

## 📝 Notas importantes

- **Supabase usa PostgreSQL**: No necesitas cambiar el schema, Prisma conecta igual
- **SSL requerido**: Supabase requiere SSL por defecto en conexiones remotas (Prisma maneja esto automáticamente)
- **Respaldos**: Supabase hace backups automáticos diarios
- **Alternativa**: Si no quieres migrar datos, simplemente actualiza el `DATABASE_URL` y ejecuta `npm run db:push` para crear tablas vacías

## 🚨 Troubleshooting

### Error: "FATAL: password authentication failed"
→ Verifica que el `DATABASE_URL` sea correcto (especialmente la contraseña y Project ID)

### Error: "relation does not exist"
→ Ejecuta `npm run db:push` para sincronizar las tablas

### Error: "SSL certificate problem"
→ Supabase requiere SSL. Añade `?sslmode=require` al final del `DATABASE_URL` (Prisma lo hace automáticamente)

### La migración de datos falla
→ Asegúrate que:
  1. PostgreSQL local esté corriendo en `localhost:5433`
  2. El DATABASE_URL en .env está actualizado a Supabase
  3. Las tablas existen en Supabase (`npm run db:push`)
