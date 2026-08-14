import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationError,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineConnection,
	type EngineRuntime,
	type ProjectHandle,
	type ProjectSnapshotEnvelope,
	type RecoveryHandle,
	type SettingsSnapshot
} from '../../../packages/contracts/src/index.js'
import type {
	WebProjectFilePort,
	WebProjectOpenSelection,
	WebProjectSaveSelection
} from './persistence/browserProjectFiles.js'
import { createWebRuntime, type WebPersistenceRuntime } from './webRuntime.js'

const projectHandle = `project:${'A'.repeat(64)}` as ProjectHandle
const settings = Object.freeze<SettingsSnapshot>({
	version: 3,
	colorScheme: 'system',
	metronome: Object.freeze({ enabled: false, volume: 0.65 }),
	shortcutOverrides: Object.freeze([])
})

function success<Value>(value: Value): ApplicationResult<Value> {
	return Object.freeze({ ok: true as const, value })
}

function fakeEngine(): EngineRuntime {
	const health = Object.freeze<AudioHealthSnapshot>({
		activeDeviceId: null,
		activeVoices: 0,
		backendState: 'disconnected',
		blockFrames: null,
		deviceState: 'unavailable',
		mode: 'browser',
		outputMuted: true,
		outputSignalObserved: false,
		projectRevision: null,
		sampleRate: null,
		underruns: 0
	})
	return Object.freeze({
		connect: async (): Promise<ApplicationResult<EngineConnection>> =>
			Object.freeze({
				ok: false as const,
				error: applicationError('PERMISSION_DENIED', 'Activation required.')
			}),
		disconnect: async () => success(null),
		send: async () => success(Object.freeze({ accepted: true as const })),
		onEvent: () => () => undefined,
		getHealth: async () => success(health),
		onHealth: () => () => undefined
	})
}

describe('createWebRuntime', () => {
	it('exposes the Web capabilities and defers persistence behind picker activation', async () => {
		const calls: string[] = []
		const openSelection = Object.freeze({
			file: Object.freeze({
				size: 0,
				arrayBuffer: async () => new ArrayBuffer(0)
			}),
			handle: null
		}) satisfies WebProjectOpenSelection
		const saveSelection = Object.freeze({ status: 'canceled' as const })
		const files: WebProjectFilePort = Object.freeze({
			download: () => undefined,
			open: () => {
				calls.push('open-picker')
				return Promise.resolve(openSelection)
			},
			save: () => {
				calls.push('save-picker')
				return Promise.resolve(saveSelection)
			}
		})
		const projects: WebPersistenceRuntime['projects'] = Object.freeze({
			create: async () => success(projectHandle),
			open: async () => success(projectHandle),
			openSelection: async (selection: Promise<WebProjectOpenSelection | null>) => {
				calls.push('open-selection')
				assert.equal(await selection, openSelection)
				return success(projectHandle)
			},
			load: async () =>
				success(
					Object.freeze({
						fingerprint: null,
						snapshot: Object.freeze({ revision: 0, bytes: new Uint8Array() })
					})
				),
			persist: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			persistAs: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			persistAsSelection: async (
				_handle: ProjectHandle,
				snapshot: ProjectSnapshotEnvelope,
				selection: Promise<WebProjectSaveSelection>
			) => {
				calls.push('save-selection')
				assert.equal(await selection, saveSelection)
				return Object.freeze({ status: 'canceled' as const, revision: snapshot.revision })
			},
			saveCopy: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			writeRecovery: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				success(Object.freeze({ revision: snapshot.revision })),
			listRecoveries: async () => success(Object.freeze([])),
			restoreRecovery: async () => success(projectHandle),
			discardRecovery: async (_handle: RecoveryHandle, throughRevision: number) =>
				success(Object.freeze({ discardedThroughRevision: throughRevision }))
		})
		const persistence = Object.freeze<WebPersistenceRuntime>({
			projects,
			settings: Object.freeze({
				get: async () => success(settings),
				set: async (snapshot: SettingsSnapshot) => success(snapshot)
			})
		})
		const engine = fakeEngine()
		const runtime = createWebRuntime({
			engine,
			files,
			loadPersistence: async () => {
				calls.push('load-persistence')
				return persistence
			}
		})

		assert.equal(runtime.target, 'web')
		assert.equal(runtime.engine.availability, 'available')
		if (runtime.engine.availability === 'available') assert.equal(runtime.engine.api, engine)
		assert.equal(runtime.projects.availability, 'available')
		assert.equal(runtime.settings.availability, 'available')
		assert.equal(runtime.resources.availability, 'unavailable')
		assert.equal(runtime.commands.availability, 'unavailable')
		assert.equal(runtime.lifecycle.availability, 'unavailable')
		assert.equal(runtime.nativeWindow.availability, 'unavailable')
		assert.deepEqual(calls, [])

		if (runtime.projects.availability !== 'available') throw new Error('Projects unavailable')
		const opened = runtime.projects.api.open()
		assert.deepEqual(calls, ['open-picker'])
		assert.equal((await opened).ok, true)
		assert.deepEqual(calls, ['open-picker', 'load-persistence', 'open-selection'])

		const persistedAs = runtime.projects.api.persistAs(projectHandle, {
			revision: 3,
			bytes: new Uint8Array()
		})
		assert.deepEqual(calls.slice(-1), ['save-picker'])
		assert.equal((await persistedAs).status, 'canceled')
		assert.deepEqual(calls.slice(-2), ['save-picker', 'save-selection'])

		if (runtime.settings.availability !== 'available') throw new Error('Settings unavailable')
		assert.deepEqual(await runtime.settings.api.get(), success(settings))
		assert.equal(calls.filter((call) => call === 'load-persistence').length, 1)
	})
})
