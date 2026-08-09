import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

export type BundleClass = 'desktop-main' | 'desktop-preload' | 'desktop-renderer' | 'web'

function repositoryModuleId(repositoryRoot: string, module: string): string {
	if (module.startsWith('\0')) return module
	const repositoryPath = relative(repositoryRoot, module).replaceAll('\\', '/')
	return repositoryPath === '..' || repositoryPath.startsWith('../')
		? `[external]/${basename(module)}`
		: repositoryPath
}

export function bundleAttributionPlugin(bundleClass: BundleClass): Plugin {
	const repositoryRoot = resolve('.')
	return {
		name: `tiempio-${bundleClass}-bundle-attribution`,
		generateBundle(_options, bundle) {
			const chunks = Object.values(bundle)
				.filter((entry) => entry.type === 'chunk')
				.map((chunk) => ({
					file: chunk.fileName,
					bytes: Buffer.byteLength(chunk.code),
					modules: Object.entries(chunk.modules)
						.map(([module, details]) => ({
							module: repositoryModuleId(repositoryRoot, module),
							renderedBytes: details.renderedLength
						}))
						.sort((left, right) => right.renderedBytes - left.renderedBytes)
				}))
				.sort((left, right) => right.bytes - left.bytes)
			const reportPath = resolve(
				'artifacts/stage-1/bundle',
				`${bundleClass}-module-attribution.json`
			)
			mkdirSync(resolve(reportPath, '..'), { recursive: true })
			writeFileSync(
				reportPath,
				`${JSON.stringify({ schemaVersion: 1, bundleClass, chunks }, null, 2)}\n`,
				'utf8'
			)
		}
	}
}
