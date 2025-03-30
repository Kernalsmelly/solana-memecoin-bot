#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Test runner script to execute all tests with proper setup/teardown
 */
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Ensure logs directory exists
const logDir = path_1.default.join(__dirname, '../../logs');
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir, { recursive: true });
}
console.log('💡 Running unit tests...');
try {
    // Run individual test files one by one to isolate failures
    const testFiles = [
        './src/tests/riskManager.test.ts',
        './src/tests/birdeyeAPI.test.ts',
        './src/tests/tokenDiscovery.test.ts',
        './src/tests/patternDetector.test.ts'
    ];
    for (const testFile of testFiles) {
        console.log(`\n🧪 Testing: ${testFile}`);
        try {
            (0, child_process_1.execSync)(`npx vitest run ${testFile} --reporter verbose`, {
                stdio: 'inherit',
                timeout: 30000
            });
            console.log(`✅ ${testFile} - Tests passed`);
        }
        catch (err) {
            console.error(`❌ ${testFile} - Tests failed`);
            // Continue to next test file even if this one fails
        }
    }
    console.log('\n🔍 Test summary completed');
}
catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
}
