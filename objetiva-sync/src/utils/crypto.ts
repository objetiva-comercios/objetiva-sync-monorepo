import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { hash, compare } from 'bcrypt';
import { ENCRYPTION_CONFIG, BCRYPT_CONFIG } from '../config/index.js';
import { requireEnv } from '../config/index.js';

/**
 * Deriva una clave de encriptación de 32 bytes desde el ENCRYPTION_KEY
 */
function deriveKey(key: string): Buffer {
  // Usar scrypt para derivar una clave de longitud fija
  return scryptSync(key, 'salt', ENCRYPTION_CONFIG.KEY_LENGTH);
}

/**
 * Encripta un string usando AES-256-GCM
 * Retorna: iv + authTag + encrypted (todo en hex)
 */
export function encrypt(plaintext: string): string {
  const env = requireEnv();

  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY no configurada');
  }

  // Generar IV aleatorio
  const iv = randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);

  // Derivar clave
  const key = deriveKey(env.ENCRYPTION_KEY);

  // Crear cipher
  const cipher = createCipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);

  // Encriptar
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Obtener auth tag
  const authTag = cipher.getAuthTag();

  // Concatenar: iv + authTag + encrypted (todo en hex)
  const result = iv.toString('hex') + authTag.toString('hex') + encrypted;

  return result;
}

/**
 * Desencripta un string encriptado con AES-256-GCM
 * Espera: iv + authTag + encrypted (todo en hex)
 */
export function decrypt(ciphertext: string): string {
  const env = requireEnv();

  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY no configurada');
  }

  try {
    // Extraer componentes
    const ivLength = ENCRYPTION_CONFIG.IV_LENGTH * 2; // hex
    const authTagLength = ENCRYPTION_CONFIG.AUTH_TAG_LENGTH * 2; // hex

    const iv = Buffer.from(ciphertext.slice(0, ivLength), 'hex');
    const authTag = Buffer.from(
      ciphertext.slice(ivLength, ivLength + authTagLength),
      'hex'
    );
    const encrypted = ciphertext.slice(ivLength + authTagLength);

    // Derivar clave
    const key = deriveKey(env.ENCRYPTION_KEY);

    // Crear decipher
    const decipher = createDecipheriv(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Desencriptar
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Error al desencriptar: ${error instanceof Error ? error.message : 'Error desconocido'}`
    );
  }
}

/**
 * Hashea un password usando bcrypt
 * Costo: 12 rounds (configurable en BCRYPT_CONFIG.SALT_ROUNDS)
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_CONFIG.SALT_ROUNDS);
}

/**
 * Compara un password con su hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}

/**
 * Genera una clave aleatoria segura de longitud especificada
 * Retorna el resultado en hexadecimal
 */
export function generateKey(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Encripta un objeto JSON
 */
export function encryptJSON(obj: object): string {
  const json = JSON.stringify(obj);
  return encrypt(json);
}

/**
 * Desencripta un objeto JSON
 */
export function decryptJSON<T = object>(ciphertext: string): T {
  const json = decrypt(ciphertext);
  return JSON.parse(json) as T;
}

/**
 * Helper para encriptar credenciales
 */
export function encryptCredentials(credentials: {
  username?: string;
  password?: string;
  [key: string]: unknown;
}): string {
  return encryptJSON(credentials);
}

/**
 * Helper para desencriptar credenciales
 */
export function decryptCredentials(
  ciphertext: string
): {
  username?: string;
  password?: string;
  [key: string]: unknown;
} {
  return decryptJSON(ciphertext);
}
