import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
	applicationError,
	applicationRuntimeVersion,
	sanitizeApplicationError,
	validateProjectHandle,
	validateProjectSnapshotEnvelope,
	validateRecoveryHandle,
	validateSettingsSnapshot,
	type ApplicationResult,
	type ProjectHandle,
	type ProjectSnapshotEnvelope,
	type RecoveryHandle
} from '../../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../../host/runtime-channels.js'
import { type RendererAuthority } from '../renderer-authority.js'
import { type DesktopPersistenceServices } from './desktop-persistence.js'

interface RuntimeCall {
	readonly runtimeVersion: number
}

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	const expected = [...keys].sort()
	return (
		actual.length === expected.length && actual.every((key, index) => key === expected[index])
	)
}

function validRuntimeCall(input: unknown): input is RuntimeCall {
	return (
		record(input) &&
		exactKeys(input, ['runtimeVersion']) &&
		input.runtimeVersion === applicationRuntimeVersion
	)
}

function invalidRequest(message: string): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('INVALID_REQUEST', message)
	})
}

function closingFailure(): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('OPERATION_UNAVAILABLE', 'The application is closing.')
	})
}

export interface PersistenceIpcController {
	awaitIdle(timeoutMs?: number): Promise<ApplicationResult<null>>
	beginClose(): void
	cancelClose(): void
	dispose(): void
}

export function registerPersistenceHandlers(
	authority: RendererAuthority,
	services: DesktopPersistenceServices
): PersistenceIpcController {
	const pending = new Set<Promise<unknown>>()
	let closing = false

	const authorize = (event: IpcMainInvokeEvent): boolean => authority.authorize(event) !== null
	const track = <Value>(
		operation: () => Promise<Value>
	): Promise<Value | ApplicationResult<never>> => {
		if (closing) return Promise.resolve(closingFailure())
		let tracked: Promise<Value>
		try {
			tracked = operation()
		} catch (error) {
			return Promise.resolve(
				Object.freeze({ ok: false as const, error: sanitizeApplicationError(error) })
			)
		}
		pending.add(tracked)
		void tracked.then(
			() => pending.delete(tracked),
			() => pending.delete(tracked)
		)
		return tracked.catch((error: unknown) =>
			Object.freeze({ ok: false as const, error: sanitizeApplicationError(error) })
		)
	}
	const noArguments = (event: IpcMainInvokeEvent, call: unknown): boolean =>
		authorize(event) && validRuntimeCall(call)
	const projectHandleCall = (event: IpcMainInvokeEvent, call: unknown): ProjectHandle | null => {
		if (
			!authorize(event) ||
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'handle']) ||
			call.runtimeVersion !== applicationRuntimeVersion
		) {
			return null
		}
		const handle = validateProjectHandle(call.handle)
		return handle.ok ? handle.value : null
	}
	const recoveryHandleCall = (
		event: IpcMainInvokeEvent,
		call: unknown
	): RecoveryHandle | null => {
		if (
			!authorize(event) ||
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'handle']) ||
			call.runtimeVersion !== applicationRuntimeVersion
		) {
			return null
		}
		const handle = validateRecoveryHandle(call.handle)
		return handle.ok ? handle.value : null
	}
	const projectSnapshotCall = (
		event: IpcMainInvokeEvent,
		call: unknown
	): { readonly handle: ProjectHandle; readonly snapshot: ProjectSnapshotEnvelope } | null => {
		if (
			!authorize(event) ||
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'handle', 'snapshot']) ||
			call.runtimeVersion !== applicationRuntimeVersion
		) {
			return null
		}
		const handle = validateProjectHandle(call.handle)
		const snapshot = validateProjectSnapshotEnvelope(call.snapshot)
		return handle.ok && snapshot.ok
			? Object.freeze({ handle: handle.value, snapshot: snapshot.value })
			: null
	}

	ipcMain.handle(desktopRuntimeChannels.projectCreate, (event, call: unknown) =>
		noArguments(event, call)
			? track(() => services.projects.create())
			: invalidRequest('Project create request is invalid.')
	)
	ipcMain.handle(desktopRuntimeChannels.projectOpen, (event, call: unknown) =>
		noArguments(event, call)
			? track(() => services.projects.open())
			: invalidRequest('Project open request is invalid.')
	)
	ipcMain.handle(desktopRuntimeChannels.projectLoad, (event, call: unknown) => {
		const handle = projectHandleCall(event, call)
		return handle === null
			? invalidRequest('Project load request is invalid.')
			: track(() => services.projects.load(handle))
	})
	for (const [channel, operation] of [
		[desktopRuntimeChannels.projectPersist, services.projects.persist.bind(services.projects)],
		[
			desktopRuntimeChannels.projectPersistAs,
			services.projects.persistAs.bind(services.projects)
		],
		[desktopRuntimeChannels.projectSaveCopy, services.projects.saveCopy.bind(services.projects)]
	] as const) {
		ipcMain.handle(channel, (event, call: unknown) => {
			const validated = projectSnapshotCall(event, call)
			return validated === null
				? invalidRequest('Project persistence request is invalid.')
				: track(() => operation(validated.handle, validated.snapshot))
		})
	}
	ipcMain.handle(desktopRuntimeChannels.projectWriteRecovery, (event, call: unknown) => {
		const validated = projectSnapshotCall(event, call)
		return validated === null
			? invalidRequest('Project recovery request is invalid.')
			: track(() => services.projects.writeRecovery(validated.handle, validated.snapshot))
	})
	ipcMain.handle(desktopRuntimeChannels.projectListRecoveries, (event, call: unknown) =>
		noArguments(event, call)
			? track(() => services.projects.listRecoveries())
			: invalidRequest('Recovery list request is invalid.')
	)
	ipcMain.handle(desktopRuntimeChannels.projectRestoreRecovery, (event, call: unknown) => {
		const handle = recoveryHandleCall(event, call)
		return handle === null
			? invalidRequest('Recovery restore request is invalid.')
			: track(() => services.projects.restoreRecovery(handle))
	})
	ipcMain.handle(desktopRuntimeChannels.projectDiscardRecovery, (event, call: unknown) => {
		if (
			!authorize(event) ||
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'handle', 'throughRevision']) ||
			call.runtimeVersion !== applicationRuntimeVersion ||
			!Number.isSafeInteger(call.throughRevision) ||
			Number(call.throughRevision) < 0
		) {
			return invalidRequest('Recovery discard request is invalid.')
		}
		const handle = validateRecoveryHandle(call.handle)
		return !handle.ok
			? invalidRequest('Recovery discard request is invalid.')
			: track(() =>
					services.projects.discardRecovery(handle.value, Number(call.throughRevision))
				)
	})
	ipcMain.handle(desktopRuntimeChannels.settingsGet, (event, call: unknown) =>
		noArguments(event, call)
			? track(() => services.settings.get())
			: invalidRequest('Settings read request is invalid.')
	)
	ipcMain.handle(desktopRuntimeChannels.settingsSet, (event, call: unknown) => {
		if (
			!authorize(event) ||
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'snapshot']) ||
			call.runtimeVersion !== applicationRuntimeVersion
		) {
			return invalidRequest('Settings write request is invalid.')
		}
		const snapshot = validateSettingsSnapshot(call.snapshot)
		return !snapshot.ok
			? invalidRequest('Settings write request is invalid.')
			: track(() => services.settings.set(snapshot.value))
	})

	return Object.freeze({
		beginClose: () => {
			closing = true
		},
		cancelClose: () => {
			closing = false
		},
		awaitIdle: async (timeoutMs = 10_000) => {
			if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) {
				return invalidRequest('Persistence close barrier timeout is invalid.')
			}
			const operations = [...pending]
			if (operations.length === 0) return Object.freeze({ ok: true as const, value: null })
			let timeout: ReturnType<typeof setTimeout> | undefined
			try {
				await Promise.race([
					Promise.allSettled(operations),
					new Promise<never>((_resolve, reject) => {
						timeout = setTimeout(
							() => reject(new Error('Persistence barrier timed out.')),
							timeoutMs
						)
					})
				])
				return Object.freeze({ ok: true as const, value: null })
			} catch {
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'STORAGE_UNAVAILABLE',
						'Project persistence did not finish before close.',
						{ retryable: true }
					)
				})
			} finally {
				if (timeout !== undefined) clearTimeout(timeout)
			}
		},
		dispose: () => {
			closing = true
			for (const channel of [
				desktopRuntimeChannels.projectCreate,
				desktopRuntimeChannels.projectOpen,
				desktopRuntimeChannels.projectLoad,
				desktopRuntimeChannels.projectPersist,
				desktopRuntimeChannels.projectPersistAs,
				desktopRuntimeChannels.projectSaveCopy,
				desktopRuntimeChannels.projectWriteRecovery,
				desktopRuntimeChannels.projectListRecoveries,
				desktopRuntimeChannels.projectRestoreRecovery,
				desktopRuntimeChannels.projectDiscardRecovery,
				desktopRuntimeChannels.settingsGet,
				desktopRuntimeChannels.settingsSet
			]) {
				ipcMain.removeHandler(channel)
			}
		}
	})
}
