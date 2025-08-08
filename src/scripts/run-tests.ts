#!/usr/bin/env ts-node
/**
 * Test runner script to execute all tests with proper setup/teardown
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

console.log('💡 Running unit tests...');

try {
  // Run individual test files one by one to isolate failures
  const testFiles = [
    './src/tests/riskManager.test.ts',
    './src/tests/birdeyeAPI.test.ts',
    './src/tests/tokenDiscovery.test.ts',
    './src/tests/patternDetector.test.ts',
  ];

  for (const testFile of testFiles) {
    console.log(`\n🧪 Testing: ${testFile}`);
    try {
      execSync(`npx vitest run ${testFile} --reporter verbose`, {
        stdio: 'inherit',
        timeout: 30000,
      });
      console.log(`✅ ${testFile} - Tests passed`);
    } catch (err) {
      console.error(`❌ ${testFile} - Tests failed`);
      // Continue to next test file even if this one fails
    }
  }

  console.log('\n🔍 Test summary completed');
} catch (error) {
  console.error('❌ Error running tests:', error);
  process.exit(1);
}
