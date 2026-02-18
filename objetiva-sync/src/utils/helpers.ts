/**
 * Pausa la ejecución por un número de milisegundos
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formatea una fecha a string ISO 8601
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Parsea una fecha ISO 8601 a Date
 */
export function parseDate(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${dateString}`);
  }
  return date;
}

/**
 * Reemplaza placeholders en una query SQL
 * Ejemplo: :lastSync → '2024-01-15T10:30:00Z'
 */
export function parseSQLPlaceholders(
  sql: string,
  params: Record<string, string | number>
): string {
  let result = sql;

  // Reemplazar cada placeholder
  for (const [key, value] of Object.entries(params)) {
    const placeholder = `:${key}`;
    const replacement = typeof value === 'string' ? `'${value}'` : value.toString();
    result = result.replace(new RegExp(placeholder, 'g'), replacement);
  }

  return result;
}

/**
 * Reemplaza el placeholder :lastSync en una query
 */
export function replaceLastSyncPlaceholder(sql: string, lastSyncValue: string | number): string {
  return parseSQLPlaceholders(sql, {
    lastSync: lastSyncValue,
  });
}

/**
 * Sanitiza un string para uso en SQL (básico, preferir queries parametrizadas)
 */
export function sanitizeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Trunca un string a una longitud máxima
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Capitaliza la primera letra de un string
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convierte un string a formato título (primera letra de cada palabra en mayúscula)
 */
export function titleCase(str: string): string {
  return str
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Calcula el próximo momento de reintento con backoff exponencial
 */
export function calculateNextRetry(
  attemptNumber: number,
  backoffSchedule: readonly number[]
): Date {
  // attemptNumber es 0-indexed
  let delayMinutes: number;

  if (attemptNumber < backoffSchedule.length) {
    delayMinutes = backoffSchedule[attemptNumber] ?? 60;
  } else {
    delayMinutes = backoffSchedule[backoffSchedule.length - 1] ?? 60;
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() + delayMinutes);
  return now;
}

/**
 * Divide un array en chunks de tamaño específico
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Espera hasta que una condición sea verdadera (con timeout)
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await sleep(intervalMs);
  }

  return false;
}

/**
 * Retry genérico con backoff exponencial
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffFactor?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffFactor = 2,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts - 1) {
        const delay = delayMs * Math.pow(backoffFactor, attempt);
        onRetry?.(attempt + 1, error);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Convierte un objeto a query string
 */
export function toQueryString(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.toString())}`)
    .join('&');
}

/**
 * Parsea un query string a objeto
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = queryString.replace(/^\?/, '').split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }

  return params;
}

/**
 * Deep clone de un objeto (simple, no maneja casos complejos)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Verifica si un valor es un objeto plano
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge profundo de objetos
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Formatea un número a moneda
 */
export function formatCurrency(amount: number, currency: string = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formatea un número con separadores de miles
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-AR').format(num);
}

/**
 * Calcula un porcentaje
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Valida si un string es una fecha ISO válida
 */
export function isISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString();
}

/**
 * Obtiene la diferencia en milisegundos entre dos fechas
 */
export function dateDiffMs(date1: Date, date2: Date): number {
  return Math.abs(date1.getTime() - date2.getTime());
}

/**
 * Formatea milisegundos a string legible
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Obtiene el timestamp actual en formato ISO
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Obtiene la fecha de N días atrás
 */
export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}
