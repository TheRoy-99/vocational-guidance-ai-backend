/**
 * Script para migrar datos de PostgreSQL local a Supabase
 * Uso: npm run migrate:supabase
 *
 * Pasos:
 * 1. Asegúrate de tener credenciales de Supabase en .env
 * 2. Las tablas deben estar creadas en Supabase (run: prisma migrate deploy --skip-generate)
 * 3. Ejecuta este script
 * 4. Los datos se exportarán y se intentará importar a Supabase
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@localhost:5433/orienta_db';
const EXPORT_PATH = path.join(process.cwd(), 'migrations', `export-${Date.now()}.json`);

async function migrateToSupabase() {
  console.log('🚀 Iniciando migración de datos a Supabase...\n');

  // Crear prisma local
  const localPrisma = new PrismaClient({
    datasources: {
      db: {
        url: LOCAL_DB_URL,
      },
    },
  });

  // Crear prisma para Supabase (usa variable de entorno)
  const supabasePrisma = new PrismaClient();

  try {
    // Paso 1: Exportar datos locales
    console.log('📤 Exportando datos de PostgreSQL local...');
    const users = await localPrisma.user.findMany();
    const assessments = await localPrisma.chasideAssessment.findMany();

    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        users: users.length,
        assessments: assessments.length,
      },
      data: {
        users,
        assessments,
      },
    };

    // Guardar export
    if (!fs.existsSync(path.dirname(EXPORT_PATH))) {
      fs.mkdirSync(path.dirname(EXPORT_PATH), { recursive: true });
    }
    fs.writeFileSync(EXPORT_PATH, JSON.stringify(exportData, null, 2));
    console.log(`✅ Datos exportados a: ${EXPORT_PATH}`);
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Assessments: ${assessments.length}\n`);

    // Paso 2: Insertar en Supabase
    console.log('📥 Insertando datos en Supabase...');
    let usersInserted = 0;
    let assessmentsInserted = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await supabasePrisma.user.upsert({
          where: { id: user.id },
          update: user,
          create: user,
        });
        usersInserted++;
      } catch (error) {
        console.error(`   ❌ Error al insertar usuario ${user.id}:`, error);
        errors++;
      }
    }

    for (const assessment of assessments) {
      try {
        await supabasePrisma.chasideAssessment.upsert({
          where: { id: assessment.id },
          update: assessment,
          create: assessment,
        });
        assessmentsInserted++;
      } catch (error) {
        console.error(`   ❌ Error al insertar assessment ${assessment.id}:`, error);
        errors++;
      }
    }

    console.log(`✅ Datos insertados en Supabase:`);
    console.log(`   - Users: ${usersInserted}`);
    console.log(`   - Assessments: ${assessmentsInserted}`);
    if (errors > 0) {
      console.log(`   - Errores: ${errors}`);
    }

    console.log('\n✨ Migración completada exitosamente!');
    console.log(`\n📌 Próximos pasos:`);
    console.log(`   1. Verifica los datos en Supabase Dashboard`);
    console.log(`   2. Actualiza tu aplicación para usar Supabase`);
    console.log(`   3. Actualiza DATABASE_URL en tu .env`);
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  } finally {
    await localPrisma.$disconnect();
    await supabasePrisma.$disconnect();
  }
}

migrateToSupabase();
