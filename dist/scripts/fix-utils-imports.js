import { promises as fs } from 'fs';
import { join } from 'path';
async function fixImports() {
    const files = await fs.readdir('./src/utils');
    const tsFiles = files.filter((f) => f.endsWith('.ts'));
    for (const file of tsFiles) {
        const content = await fs.readFile(`./src/utils/${file}`, 'utf8');
        // Fix logger imports
        let updated = content
            .replace(/from ['"]\./g, "from './")
            .replace(/from ['"]\.\./g, "from '../")
            .replace(/\.ts['"];/g, ".ts.js';");
        // Fix specific imports
        updated = updated
            .replace(/from ['"]\.\/logger['"];/g, "from './logger.js';")
            .replace(/from ['"]\.\/config['"];/g, "from './config.js';")
            .replace(/from ['"]\.\/discordNotifier['"];/g, "from './discordNotifier.js';")
            .replace(/from ['"]\.\/signalLogger['"];/g, "from './signalLogger.js';")
            .replace(/from ['"]\.\/getRecentTradeStats['"];/g, "from './getRecentTradeStats.js';")
            .replace(/from ['"]\.\/ParameterSweepManager['"];/g, "from '../strategy/ParameterSweepManager.js';");
        await fs.writeFile(`./src/utils/${file}`, updated, 'utf8');
    }
}
fixImports().catch(console.error);
//# sourceMappingURL=fix-utils-imports.js.map