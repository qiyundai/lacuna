import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			pages: process.env.LACUNA_BUILD_DIR || 'build',
			assets: process.env.LACUNA_BUILD_DIR || 'build',
			fallback: 'index.html'
		})
	}
};

export default config;
