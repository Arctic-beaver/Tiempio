import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { bundleAttributionPlugin } from './build/bundleAttribution'
import { contentSecurityPolicyPlugin } from './build/contentSecurityPolicy'
import { embeddedWebEngineWasmPlugin } from './build/embeddedWebEngineWasm'

export default defineConfig(({ command }) => ({
	root: resolve('apps/web/bootstrap'),
	base: './',
	plugins: [
		embeddedWebEngineWasmPlugin(),
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
			output: {
				entryFileNames: 'assets/web-entry-[hash].js',
				chunkFileNames: 'assets/[name]-[hash].js'
			}
		}
	},
	worker: {
		format: 'es',
		plugins: () => [embeddedWebEngineWasmPlugin()],
		rollupOptions: {
			output: { entryFileNames: 'assets/web-worklet-[hash].js' }
		}
	}
}))
