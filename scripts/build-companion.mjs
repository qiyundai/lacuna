import { build } from 'esbuild';
await build({ entryPoints: ['packages/companion/src/cli.mjs'], outfile: 'packages/companion/dist/server.mjs', bundle: true, platform: 'node', target: 'node22', format: 'esm' });
