import { build, transform } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import compiler from '../packages/frontend/node_modules/svelte/compiler/index.js';
const { compileModule } = compiler;
await build({ entryPoints: ['tests/regression.test.mjs'], outfile: '.test-output/regression.test.mjs', bundle: true, platform: 'node', target: 'node22', format: 'esm',
  nodePaths: ['packages/worker/node_modules', 'packages/frontend/node_modules'], define: { 'import.meta.env': '{"DEV":false}' },
  plugins: [{ name: 'svelte-state', setup(build) { build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
    const { code } = await transform(await readFile(path, 'utf8'), { loader: 'ts' });
    return { contents: compileModule(code, { filename: path, generate: 'client' }).js.code, loader: 'js' };
  }); } }] });
const child = spawn(process.execPath, ['--test', '.test-output/regression.test.mjs'], { stdio: 'inherit', windowsHide: true });
child.on('exit', code => { process.exitCode = code ?? 1; });
