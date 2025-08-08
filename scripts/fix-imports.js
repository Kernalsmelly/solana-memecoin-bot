import { promises as fs } from 'fs';
import { join } from 'path';

async function fixImports() {
  const files = await fs.readdir('./src');
  const tsFiles = files.filter((f) => f.endsWith('.ts'));

  for (const file of tsFiles) {
    const content = await fs.readFile(`./src/${file}`, 'utf8');
    const updated = content
      .replace(/from ['"]\./g, "from './")
      .replace(/from ['"]\.\./g, "from '../")
      .replace(/\.ts['"];/g, ".ts.js';");
    await fs.writeFile(`./src/${file}`, updated, 'utf8');
  }
}

fixImports().catch(console.error);
