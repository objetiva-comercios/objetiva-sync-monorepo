/**
 * Test setup and global configuration
 * Runs before all test files
 */

import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Disable logging in tests unless explicitly enabled
if (!process.env.ENABLE_TEST_LOGS) {
  process.env.LOG_LEVEL = 'error';
}

// Load environment configuration BEFORE any test files import modules
// This must run at module level, not in beforeAll, because imported modules
// (like transformer, repositories) initialize loggers at module load time
try {
  loadEnv();
} catch (error) {
  console.error('❌ Failed to load environment during setup:', error);
  throw error;
}

beforeAll(() => {
  // Global test setup
  console.log('🧪 Starting test suite...');
  console.log('✅ Environment loaded successfully');
});

afterAll(() => {
  // Global test cleanup
  console.log('✅ Test suite completed');
});
