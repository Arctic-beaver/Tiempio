import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { bundleAttributionPlugin } from './build/bundleAttribution'
import { contentSecurityPolicyPlugin } from './build/contentSecurityPolicy'

export default defineConfig(({ command }) => ({
	main: {
		plugins: [bundleAttributionPlugin('desktop-main')],
		build: {
			outDir: resolve('dist/desktop/main'),
			rollupOptions: { input: resolve('apps/desktop/main/index.ts') }
		}
	},
	preload: {
		plugins: [bundleAttributionPlugin('desktop-preload')],
		build: {
			outDir: resolve('dist/desktop/preload'),
			rollupOptions: {
				input: resolve('apps/desktop/preload/index.ts'),
				output: { format: 'cjs', entryFileNames: 'index.cjs' }
			}
		}
	},
	renderer: {
		root: resolve('apps/desktop/renderer'),
		plugins: [
			contentSecurityPolicyPlugin('desktop', command === 'serve'),
			react(),
			bundleAttributionPlugin('desktop-renderer')
		],
		build: {
			outDir: resolve('dist/desktop/renderer'),
			emptyOutDir: true,
			minify: 'esbuild',
			sourcemap: false,
			rollupOptions: {
				input: resolve('apps/desktop/renderer/index.html'),
				output: { entryFileNames: 'assets/desktop-entry-[hash].js' }
			}
		}
	}
}))
