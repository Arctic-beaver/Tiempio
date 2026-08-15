import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationEngineRequestedCapabilityCodes,
	evaluateEngineCapabilities,
	engineProtocolLimits,
	engineProtocolVersion,
	EngineProtocolSession,
	nativeHostCapabilityCodes,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	validateEngineHandshake
} from './engine-protocol.js'

const compatibleHandshake = {
	protocolVersion: engineProtocolVersion,
	peer: 'application',
	renderPlanVersion: 5,
	patchModelVersion: 4,
	capabilities: ['protocol.typed-json']
} as const

describe('engine protocol contracts', () => {
	it('exposes the current shared engine protocol contract', () => {
		assert.equal(engineProtocolVersion, 9)
	})

	it('requires the common engine surface and exactly one audible output', () => {
		assert.equal(evaluateEngineCapabilities(nativeHostCapabilityCodes).compatible, true)
		assert.equal(
			evaluateEngineCapabilities(
				applicationEngineRequestedCapabilityCodes.filter(
					(capability) => !capability.startsWith('audio.')
				)
			).compatible,
			false
		)
		assert.equal(
			evaluateEngineCapabilities(applicationEngineRequestedCapabilityCodes).compatible,
			false
		)
	})

	it('rejects version mismatch before session creation', () => {
		const result = validateEngineHandshake({
			...compatibleHandshake,
			protocolVersion: engineProtocolVersion + 1
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.version-mismatch')
	})

	it('accepts a compatible bounded handshake', () => {
		const result = validateEngineHandshake(compatibleHandshake)
		assert.equal(result.ok, true)
	})

	it('rejects an oversized command payload with a stable diagnostic', () => {
		const result = validateEngineCommandEnvelope({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-1',
			sequence: 1,
			type: 'load-render-plan',
			payload: 'x'.repeat(engineProtocolLimits.maxPayloadBytes + 1)
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.frame-too-large')
	})

	it('requires a handshake first and rejects replayed sequences', () => {
		const session = new EngineProtocolSession()
		const beforeHandshake = session.accept({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-1',
			sequence: 0,
			type: 'stop',
			payload: {}
		})
		assert.equal(beforeHandshake.ok, false)
		assert.equal(session.state, 'terminated')

		const readySession = new EngineProtocolSession()
		assert.equal(
			readySession.accept({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-2',
				sequence: 0,
				type: 'handshake',
				payload: compatibleHandshake
			}).ok,
			true
		)
		const replay = readySession.accept({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-3',
			sequence: 0,
			type: 'stop',
			payload: {}
		})
		assert.equal(replay.ok, false)
		if (!replay.ok) assert.equal(replay.diagnostic, 'protocol.invalid-sequence')
	})

	it('rejects invalid typed event payloads', () => {
		const result = validateEngineEventEnvelope({
			protocolVersion: engineProtocolVersion,
			sequence: 1,
			type: 'meter-snapshot',
			payload: { leftPeak: 2, rightPeak: 0 }
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.invalid-envelope')
	})

	it('validates bounded heartbeat and audio-health payloads', () => {
		assert.equal(
			validateEngineCommandEnvelope({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-ping',
				sequence: 1,
				type: 'ping',
				payload: { heartbeatId: 'heartbeat-1' }
			}).ok,
			true
		)
		assert.equal(
			validateEngineEventEnvelope({
				protocolVersion: engineProtocolVersion,
				sequence: 2,
				type: 'audio-health',
				payload: {
					activeDeviceId: 'device-default',
					activeVoices: 1,
					backendState: 'ready',
					blockFrames: 128,
					deviceState: 'available',
					mode: 'shared',
					outputMuted: false,
					outputSignalObserved: true,
					projectRevision: 4,
					sampleRate: 48_000,
					underruns: 0
				}
			}).ok,
			true
		)
	})

	it('validates ephemeral native metronome controls', () => {
		assert.equal(
			validateEngineCommandEnvelope({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-metronome-enabled',
				sequence: 1,
				type: 'set-metronome-enabled',
				payload: { enabled: true }
			}).ok,
			true
		)
		assert.equal(
			validateEngineCommandEnvelope({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-metronome-volume',
				sequence: 2,
				type: 'set-metronome-volume',
				payload: { volume: 1.01 }
			}).ok,
			false
		)
	})

	it('validates opaque unique audio-device descriptors', () => {
		const event = {
			protocolVersion: engineProtocolVersion,
			sequence: 3,
			type: 'audio-devices-changed',
			payload: {
				devices: [
					{ default: true, id: 'device.default', label: 'Primary output' },
					{ default: false, id: 'device.secondary', label: 'Secondary output' }
				]
			}
		} as const
		assert.equal(validateEngineEventEnvelope(event).ok, true)
		assert.equal(
			validateEngineEventEnvelope({
				...event,
				payload: { devices: [event.payload.devices[0], event.payload.devices[0]] }
			}).ok,
			false
		)
		assert.equal(
			validateEngineEventEnvelope({
				...event,
				payload: {
					devices: event.payload.devices.map((device) => ({ ...device, default: true }))
				}
			}).ok,
			false
		)
	})

	it('validates bounded transport-independent preview programs and state', () => {
		const command = {
			protocolVersion: engineProtocolVersion,
			requestId: 'request-preview',
			sequence: 4,
			type: 'start-preview',
			payload: {
				previewId: 'preview.palette.1',
				layerId: 'layer.bass',
				programVersion: 1,
				events: [
					{ offsetMs: 0, durationMs: 120, pitches: [57], velocity: 100 },
					{ offsetMs: 120, durationMs: 180, pitches: [60, 64], velocity: 96 }
				]
			}
		} as const
		assert.equal(validateEngineCommandEnvelope(command).ok, true)
		assert.equal(
			validateEngineCommandEnvelope({
				...command,
				payload: {
					...command.payload,
					events: [
						{ offsetMs: 120, durationMs: 120, pitches: [60], velocity: 100 },
						{ offsetMs: 0, durationMs: 120, pitches: [57], velocity: 100 }
					]
				}
			}).ok,
			false
		)
		assert.equal(
			validateEngineCommandEnvelope({
				...command,
				payload: {
					...command.payload,
					events: [{ offsetMs: 0, durationMs: 5_001, pitches: [57], velocity: 100 }]
				}
			}).ok,
			false
		)
		assert.equal(
			validateEngineEventEnvelope({
				protocolVersion: engineProtocolVersion,
				sequence: 5,
				type: 'preview-state',
				payload: {
					active: true,
					pitches: [57, 60, 64],
					previewId: 'preview.palette.1',
					samplePosition: 512
				}
			}).ok,
			true
		)
	})

	it('validates the bounded engine-clock recording lifecycle', () => {
		const envelope = (
			sequence: number,
			type: string,
			payload: unknown
		): {
			readonly payload: unknown
			readonly protocolVersion: number
			readonly requestId: string
			readonly sequence: number
			readonly type: string
		} => ({
			payload,
			protocolVersion: engineProtocolVersion,
			requestId: `request-recording-${String(sequence)}`,
			sequence,
			type
		})
		assert.equal(
			validateEngineCommandEnvelope(
				envelope(10, 'start-recording', {
					countInBars: 1,
					layerId: 'layer.lead',
					projectRevision: 7,
					recordingId: 'recording.1',
					startTick: 1_920
				})
			).ok,
			true
		)
		assert.equal(
			validateEngineCommandEnvelope(
				envelope(11, 'recording-note-on', {
					auditionId: 'keyboard.KeyA',
					pitch: 60,
					recordingId: 'recording.1',
					velocity: 96
				})
			).ok,
			true
		)
		assert.equal(
			validateEngineCommandEnvelope(
				envelope(12, 'start-recording', {
					countInBars: engineProtocolLimits.maxRecordingCountInBars + 1,
					layerId: 'layer.lead',
					projectRevision: 7,
					recordingId: 'recording.1',
					startTick: 1_920
				})
			).ok,
			false
		)
		assert.equal(
			validateEngineEventEnvelope({
				payload: {
					countInBeatsRemaining: 4,
					recordingId: 'recording.1',
					samplePosition: 48_000,
					sourceTick: 0,
					state: 'count-in'
				},
				protocolVersion: engineProtocolVersion,
				sequence: 20,
				type: 'recording-state'
			}).ok,
			true
		)
		assert.equal(
			validateEngineEventEnvelope({
				payload: {
					auditionId: 'keyboard.KeyA',
					phase: 'note-off',
					pitch: 60,
					recordingId: 'recording.1',
					samplePosition: 72_000,
					sourceTick: 960,
					velocity: 96
				},
				protocolVersion: engineProtocolVersion,
				sequence: 21,
				type: 'recording-input-applied'
			}).ok,
			true
		)
		assert.equal(
			validateEngineEventEnvelope({
				payload: {
					reason: 'stopped',
					recordingId: 'recording.1',
					samplePosition: 96_000,
					stopTick: 1_920
				},
				protocolVersion: engineProtocolVersion,
				sequence: 22,
				type: 'recording-stopped'
			}).ok,
			true
		)
	})
})
