import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Schema Zod para validar variables de entorno
 */
const envSchema = z.object({
  // Server
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('Objetiva Sync'),

  // Security
  ENCRYPTION_KEY: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),

  // Admin
  ADMIN_PASSWORD: z.string().min(6).optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE: z.string().default('./logs/sync.log'),

  // Database
  DATABASE_PATH: z.string().default('./database/objetiva-sync.db'),

  // Remote API (optional, configured via dashboard)
  REMOTE_API_URL: z.string().url().optional(),

  // Sync configuration (optional, configured via dashboard)
  SYNC_INTERVAL_MINUTES: z.string().regex(/^\d+$/).transform(Number).optional(),
  BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).optional(),

  // Gateway connection (for schema validation)
  GATEWAY_URL: z.string().url().optional(),
  JWT_SECRET: z.string().optional(),
});

/**
 * Tipo inferido del schema
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Configuración global exportada
 */
export let env: Env;

/**
 * Genera una clave aleatoria segura
 */
function generateSecureKey(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Agrega o actualiza una variable en el archivo .env
 */
function updateEnvFile(key: string, value: string): void {
  const envPath = join(process.cwd(), '.env');
  let envContent = '';

  // Leer archivo existente si existe
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  // Verificar si la clave ya existe
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    // Actualizar valor existente
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    // Agregar nueva clave
    envContent += `\n${key}=${value}\n`;
  }

  // Guardar archivo
  writeFileSync(envPath, envContent, 'utf-8');
}

/**
 * Carga y valida las variables de entorno
 * Si ENCRYPTION_KEY o SESSION_SECRET no existen, se generan automáticamente
 */
export function loadEnv(): Env {
  // Cargar variables de .env
  dotenvConfig();

  // Generar claves si no existen
  let encryptionKey = process.env.ENCRYPTION_KEY;
  let sessionSecret = process.env.SESSION_SECRET;

  if (!encryptionKey) {
    console.warn('⚠️  ENCRYPTION_KEY no encontrada, generando automáticamente...');
    encryptionKey = generateSecureKey(32);
    updateEnvFile('ENCRYPTION_KEY', encryptionKey);
    process.env.ENCRYPTION_KEY = encryptionKey;
    console.log('✅ ENCRYPTION_KEY generada y guardada en .env');
  }

  if (!sessionSecret) {
    console.warn('⚠️  SESSION_SECRET no encontrada, generando automáticamente...');
    sessionSecret = generateSecureKey(32);
    updateEnvFile('SESSION_SECRET', sessionSecret);
    process.env.SESSION_SECRET = sessionSecret;
    console.log('✅ SESSION_SECRET generada y guardada en .env');
  }

  // Validar con Zod
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Error al validar variables de entorno:');
    console.error(result.error.format());
    throw new Error('Variables de entorno inválidas');
  }

  env = result.data;

  // Log de configuración cargada (sin mostrar secrets)
  console.log('📋 Configuración cargada:');
  console.log(`   APP_NAME: ${env.APP_NAME}`);
  console.log(`   NODE_ENV: ${env.NODE_ENV}`);
  console.log(`   PORT: ${env.PORT}`);
  console.log(`   LOG_LEVEL: ${env.LOG_LEVEL}`);
  console.log(`   DATABASE_PATH: ${env.DATABASE_PATH}`);
  console.log(`   ENCRYPTION_KEY: ${encryptionKey ? '✅ Configurada' : '❌ No configurada'}`);
  console.log(`   SESSION_SECRET: ${sessionSecret ? '✅ Configurada' : '❌ No configurada'}`);

  if (env.REMOTE_API_URL) {
    console.log(`   REMOTE_API_URL: ${env.REMOTE_API_URL}`);
  }

  return env;
}

/**
 * Valida que la configuración esté cargada
 * Útil para usar en otros módulos
 */
export function requireEnv(): Env {
  if (!env) {
    throw new Error('Configuración no cargada. Ejecutar loadEnv() primero.');
  }
  return env;
}
