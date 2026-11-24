import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({
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
