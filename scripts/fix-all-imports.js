import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * @param {string} dir
 */
async function fixImportsInDir(dir) {
  const files = await fs.readdir(dir);
  const tsFiles = files.filter((f) => f.endsWith('.ts'));

  for (const file of tsFiles) {
    const content = await fs.readFile(join(dir, file), 'utf8');

    // Fix import patterns
    let updated = content;

    // Fix relative imports
    const replacements = [
      { pattern: /from ['"]\.\//g, replacement: "from './" },
      { pattern: /from ['"]\.\.\//g, replacement: "from '../" },
      { pattern: /from ['"]\.\.\.\//g, replacement: "from '../../" },
      { pattern: /from ['"]\.\.\.\.\//g, replacement: "from '../../../" },
      { pattern: /from ['"]\.\.\.\.\.\//g, replacement: "from '../../../../" },
      { pattern: /from ['"]\.\.\.\.\.\.\//g, replacement: "from '../../../../../" },
      { pattern: /from ['"]\.\.\.\.\.\.\.\//g, replacement: "from '../../../../../../" },
      { pattern: /from ['"]\.\.\.\.\.\.\.\.\//g, replacement: "from '../../../../../../../" },
      { pattern: /from ['"]\.\.\.\.\.\.\.\.\.\//g, replacement: "from '../../../../../../../../" },
      {
        pattern: /from ['"]\.\.\.\.\.\.\.\.\.\.\//g,
        replacement: "from '../../../../../../../../../",
      },
    ];

    for (const { pattern, replacement } of replacements) {
      updated = updated.replace(pattern, replacement);
    }

    // Add .js extension to imports
    updated = updated.replace(/\.ts['"];/g, ".ts.js';");

    await fs.writeFile(join(dir, file), updated, 'utf8');
  }
}

// Process main directories
async function main() {
  await fixImportsInDir('./src');
  await fixImportsInDir('./scripts');
  await fixImportsInDir('./src/services');
  await fixImportsInDir('./src/strategy');
  await fixImportsInDir('./src/utils');
}

main().catch(console.error);
