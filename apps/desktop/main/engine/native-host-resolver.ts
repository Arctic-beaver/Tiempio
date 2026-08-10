import { access, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface NativeHostResolutionOptions {
	readonly appPath: string
	readonly architecture: NodeJS.Architecture
	readonly isPackaged: boolean
	readonly platform: NodeJS.Platform
	readonly resourcesPath: string
}

export interface ResolvedNativeHost {
	readonly approvedRoot: string
	readonly executablePath: string
	readonly target: string
}

function executableName(platform: NodeJS.Platform): string {
	return platform === 'win32' ? 'tiempio-engine-native-host.exe' : 'tiempio-engine-native-host'
}

function inside(root: string, candidate: string): boolean {
	const child = relative(root, candidate)
	return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

export async function resolveNativeHostBinary(
	options: NativeHostResolutionOptions
): Promise<ResolvedNativeHost> {
	const target = `${options.platform}-${options.architecture}`
	const configuredRoot = options.isPackaged
		? resolve(options.resourcesPath, 'native')
		: resolve(options.appPath, 'build', 'native')
	const configuredExecutable = resolve(configuredRoot, target, executableName(options.platform))
	await access(configuredExecutable)
	const [approvedRoot, executablePath, metadata] = await Promise.all([
		realpath(configuredRoot),
		realpath(configuredExecutable),
		stat(configuredExecutable)
	])
	if (!metadata.isFile() || !inside(approvedRoot, executablePath)) {
		throw new Error('Native host executable is outside the approved application resource root.')
	}
	if (options.isPackaged && executablePath.toLowerCase().includes('.asar')) {
		throw new Error('Packaged native host executable must remain outside app.asar.')
	}
	return Object.freeze({ approvedRoot, executablePath, target })
}
