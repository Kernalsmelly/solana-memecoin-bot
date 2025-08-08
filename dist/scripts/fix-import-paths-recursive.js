import { promises as fs } from 'fs';
import { join, extname } from 'path';
// Recursively walk all files in a directory
/**
 * @param {string} dir
 * @param {string[]} [filelist]
 */
async function walk(dir, filelist = []) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
        const res = join(dir, file.name);
        if (file.isDirectory()) {
            await walk(res, filelist);
        }
        else if (file.name.endsWith('.ts') || file.name.endsWith('.js')) {
            filelist.push(res);
        }
    }
    return filelist;
}
// Fix import paths in a file
/**
 * @param {string} file
 */
async function fixImportsInFile(file) {
    let content = await fs.readFile(file, 'utf8');
    // Fix double slashes
    content = content.replace(/from ['"]\.\/\//g, "from './");
    // Fix local imports without .js extension
    content = content.replace(/from ['"]((\.{1,2}\/[^'";]+?))(?!\.js)(['"])/g, (match, p1, _p2, p3) => {
        // Ignore imports ending with .json, .css, .node, .wasm, .svg, .png, .jpg, .jpeg, .gif, .md, .cjs, .mjs, .d.ts
        if (/\.(json|css|node|wasm|svg|png|jpg|jpeg|gif|md|cjs|mjs|d\.ts)$/.test(p1))
            return match;
        return `from '${p1}.js${p3}`;
    });
    // Normalize '././' or '.././' to './' or '../'
    content = content.replace(/(\.{1,2})\/\.\//g, '$1/');
    await fs.writeFile(file, content, 'utf8');
}
async function main() {
    const roots = ['./src', './scripts'];
    for (const root of roots) {
        const files = await walk(root);
        for (const file of files) {
            await fixImportsInFile(file);
        }
    }
    console.log('All import paths fixed!');
}
main().catch(console.error);
//# sourceMappingURL=fix-import-paths-recursive.js.map