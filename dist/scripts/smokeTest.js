import { startStream } from '../src/api/birdeyeAPI.startStream.js';
import { scoreOpportunity } from '../src/utils/opportunityScorer.js';
process.on('uncaughtException', (err) => {
    console.error('[smokeTest] Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[smokeTest] Unhandled Rejection:', reason);
    process.exit(1);
});
console.log('[smokeTest] Smoke test started');
console.log('[smokeTest] About to call startStream...');
try {
    startStream((snapshot) => {
        console.log('[smokeTest] Callback fired', snapshot);
        const score = scoreOpportunity(snapshot).score;
        console.log(`[smokeTest] Opportunity score: ${score}`);
        if (score >= 60) {
            console.log('🔥', snapshot);
        }
        else {
            console.log('[smokeTest] Snapshot received, but score < 60', snapshot);
        }
        console.log('[smokeTest] Smoke test finished');
        process.exit(0);
    });
    setTimeout(() => { }, 1000);
}
catch (err) {
    console.error('[smokeTest] Error:', err);
    process.exit(1);
}
//# sourceMappingURL=smokeTest.js.map