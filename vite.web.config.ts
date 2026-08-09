import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { bundleAttributionPlugin } from './build/bundleAttribution'
import { contentSecurityPolicyPlugin } from './build/contentSecurityPolicy'

export default defineConfig(({ command }) => ({
	root: resolve('apps/web/bootstrap'),
	base: './',
	plugins: [
		contentSecurityPolicyPlugin('web', command === 'serve'),
		react(),
		bundleAttributionPlugin('web')
	],
	build: {
		outDir: resolve('dist/web'),
		emptyOutDir: true,
		minify: 'esbuild',
		sourcemap: false,
		rollupOptions: {
			input: resolve('apps/web/bootstrap/index.html'),
			output: { entryFileNames: 'assets/web-entry-[hash].js' }
		}
	}
}))
