/**
 * Tests for crypto utilities
 * Encryption, decryption, password hashing
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  encrypt,
  decrypt,
  hashPassword,
  comparePassword,
  encryptJSON,
  decryptJSON,
  encryptCredentials,
  decryptCredentials,
} from '../../src/utils/crypto.js';

describe('Crypto Utils', () => {
  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/"\'\\';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 Привет мир';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
      const plaintext = 'Same text';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Different ciphertexts due to different IVs
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to same plaintext
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw error on invalid encrypted string', () => {
      expect(() => decrypt('invalid-encrypted-string')).toThrow();
    });

    it('should throw error on tampered encrypted string', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext);

      // Tamper with the encrypted string
      const tampered = encrypted.substring(0, encrypted.length - 5) + 'XXXXX';

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('hashPassword / comparePassword', () => {
    it('should hash a password correctly', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$.{56}$/); // bcrypt format
    });

    it('should produce different hashes for same password (due to salt)', async () => {
      const password = 'myPassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword';
      const wrongPassword = 'wrongPassword';
      const hash = await hashPassword(password);

      const isValid = await comparePassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should handle empty password', async () => {
      const password = '';
      const hash = await hashPassword(password);
      const isValid = await comparePassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should handle long passwords', async () => {
      const password = 'A'.repeat(100);
      const hash = await hashPassword(password);
      const isValid = await comparePassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should be case sensitive', async () => {
      const password = 'MyPassword';
      const hash = await hashPassword(password);

      const isValid1 = await comparePassword('MyPassword', hash);
      const isValid2 = await comparePassword('mypassword', hash);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
    });
  });

  describe('encryptJSON / decryptJSON', () => {
    it('should encrypt and decrypt a JSON object', () => {
      const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const encrypted = encryptJSON(data);
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');

      const decrypted = decryptJSON(encrypted);
      expect(decrypted).toEqual(data);
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'Alice',
          address: {
            street: '123 Main St',
            city: 'Springfield',
          },
        },
        items: [1, 2, 3],
      };

      const encrypted = encryptJSON(data);
      const decrypted = decryptJSON(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should handle arrays', () => {
      const data = [1, 'two', { three: 3 }, [4, 5]];

      const encrypted = encryptJSON(data);
      const decrypted = decryptJSON(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should handle empty objects', () => {
      const data = {};

      const encrypted = encryptJSON(data);
      const decrypted = decryptJSON(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should handle null values', () => {
      const data = {
        value: null,
        items: [null, 'test', null],
      };

      const encrypted = encryptJSON(data);
      const decrypted = decryptJSON(encrypted);

      expect(decrypted).toEqual(data);
    });
  });

  describe('encryptCredentials / decryptCredentials', () => {
    it('should encrypt and decrypt credentials object', () => {
      const credentials = {
        username: 'admin',
        password: 'super-secret-password',
        apiKey: 'abc123xyz',
      };

      const encrypted = encryptCredentials(credentials);
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');

      const decrypted = decryptCredentials(encrypted);
      expect(decrypted).toEqual(credentials);
    });

    it('should handle credentials with special characters', () => {
      const credentials = {
        username: 'user@domain.com',
        password: 'P@ssw0rd!#$%',
        token: 'Bearer eyJ0eXAiOiJKV1QiLCJhbGc...',
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should handle SQL Server credentials format', () => {
      const credentials = {
        server: 'localhost',
        database: 'mydb',
        user: 'sa',
        password: 'ComplexP@ss123',
        options: {
          encrypt: true,
          trustServerCertificate: false,
        },
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });
  });

  describe('Security properties', () => {
    it('encrypted data should not contain plaintext', () => {
      const plaintext = 'sensitive-data-123';
      const encrypted = encrypt(plaintext);

      expect(encrypted).not.toContain(plaintext);
      expect(encrypted.toLowerCase()).not.toContain(plaintext.toLowerCase());
    });

    it('hashed password should not contain original password', () => {
      const password = 'myPassword123';
      const hash = hashPassword(password);

      expect(hash).not.toContain(password);
    });

    it('encrypted JSON should not contain plaintext keys or values', () => {
      const data = {
        username: 'admin',
        password: 'secretPassword',
      };

      const encrypted = encryptJSON(data);

      expect(encrypted).not.toContain('admin');
      expect(encrypted).not.toContain('secretPassword');
      expect(encrypted).not.toContain('username');
      expect(encrypted).not.toContain('password');
    });
  });
});
