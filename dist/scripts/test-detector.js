"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testDetection_1 = require("../demo/testDetection");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
async function main() {
    console.log('Starting detector test...');
    const testDetector = new testDetection_1.TestDetector();
    // Generate and log a test token
    const testToken = testDetector.generateTestToken();
    console.log('\nGenerated test token:');
    console.log(JSON.stringify(testToken, null, 2));
}
main().catch(console.error);
//# sourceMappingURL=test-detector.js.map