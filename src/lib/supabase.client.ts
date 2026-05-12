/**
 * Configuración opcional de Supabase client
 * Uso: para operaciones avanzadas de auth, storage, realtime, etc.
 * 
 * Instalación:
 * npm install @supabase/supabase-js
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function initSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables',
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    return initSupabaseClient();
  }
  return supabaseClient;
}

/**
 * Ejemplo de uso avanzado con Supabase:
 * 
 * // En un servicio NestJS:
 * import { getSupabaseClient } from '@lib/supabase.client';
 * 
 * async function uploadFile(bucket: string, path: string, file: Buffer) {
 *   const client = getSupabaseClient();
 *   const { data, error } = await client
 *     .storage
 *     .from(bucket)
 *     .upload(path, file);
 * 
 *   if (error) throw error;
 *   return data;
 * }
 */
