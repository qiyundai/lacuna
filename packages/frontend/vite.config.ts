import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';
import { journalAvailable } from '../shared/region';

export default defineConfig({
	plugins: [{
    name: 'local-journal-region',
    configureServer(server) {
      server.middlewares.use('/availability', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ available: journalAvailable(process.env.LACUNA_PREVIEW_COUNTRY ?? 'CA', process.env.LACUNA_PREVIEW_REGION ?? 'BC') }));
      });
    }
  }, sveltekit({
      alias: { '$lib': './src/lib' },
      adapter: adapter({
        pages: process.env.LACUNA_BUILD_DIR || 'build',
        assets: process.env.LACUNA_BUILD_DIR || 'build',
        fallback: 'index.html'
      }),
      compilerOptions: { runes: ({filename}) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true }
    })],
	server: { proxy: { '/reflections': 'http://127.0.0.1:8787' } }
});
