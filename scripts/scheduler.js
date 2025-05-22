// scripts/scheduler.js
// Runs analytics and parameter optimization on a schedule for continuous improvement
const cron = require('node-cron');
const { exec } = require('child_process');

// Run analytics every hour, on the hour
cron.schedule('0 * * * *', () => {
  console.log(`[Scheduler] Running analytics at ${new Date().toISOString()}`);
  exec('npx ts-node src/utils/analyzePoolDetections.ts', (err, stdout, stderr) => {
    if (err) {
      console.error('[Scheduler] Analytics error:', err);
      if (stderr) console.error(stderr);
    } else {
      console.log('[Scheduler] Analytics complete.');
      if (stdout) console.log(stdout);
    }
  });
});

console.log('[Scheduler] Analytics scheduler started.');
