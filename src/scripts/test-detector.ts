import { TestDetector } from '../demo/testDetection';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
    console.log('Starting detector test...');
    const testDetector = new TestDetector();
    
    // Generate and log a test token
    const testToken = testDetector.generateTestToken();
    console.log('\nGenerated test token:');
    console.log(JSON.stringify(testToken, null, 2));
}

main().catch(console.error);
