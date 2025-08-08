import { promises as fs } from 'fs';
import { join } from 'path';
/**
 * @param {string} file
 */
async function fixImportsInFile(file) {
    const content = await fs.readFile(file, 'utf8');
    // Fix specific imports
    let updated = content
        .replace(/from ['"]\.\/logger['"];/g, "from './logger.js';")
        .replace(/from ['"]\.\/config['"];/g, "from './config.js';")
        .replace(/from ['"]\.\/discordNotifier['"];/g, "from './discordNotifier.js';")
        .replace(/from ['"]\.\/signalLogger['"];/g, "from './signalLogger.js';")
        .replace(/from ['"]\.\/getRecentTradeStats['"];/g, "from './getRecentTradeStats.js';")
        .replace(/from ['"]\.\/ParameterSweepManager['"];/g, "from '../strategy/ParameterSweepManager.js';")
        .replace(/from ['"]\.\/strategy\/ParameterSweepManager['"];/g, "from '../strategy/ParameterSweepManager.js';");
    await fs.writeFile(file, updated, 'utf8');
}
async function main() {
    const files = [
        'src/utils/simulateSweepTrades.ts',
        'src/utils/testAnalyticsAlerts.ts',
        'src/utils/testDiscordNotifier.ts',
        'src/utils/testSignalLive.ts',
        'src/utils/tradeLogger.ts',
    ];
    for (const file of files) {
        await fixImportsInFile(join(process.cwd(), file));
    }
}
main().catch(console.error);
//# sourceMappingURL=fix-specific-imports.js.map