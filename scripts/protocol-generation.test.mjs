import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
	expectedProtocolBindings,
	parseEngineProtocolSchema,
	renderRustBinding,
	renderTypescriptBinding
} from './generate-engine-protocol.mjs'

describe('engine protocol generation', () => {
	it('keeps committed TypeScript and Rust bindings deterministic', () => {
		for (const [path, expected] of Object.entries(expectedProtocolBindings())) {
			assert.equal(readFileSync(path, 'utf8'), expected)
		}
	})

	it('renders both languages from one schema version authority', () => {
		const schema = parseEngineProtocolSchema(
			JSON.stringify({
				schemaVersion: 1,
				engineProtocolVersion: 7,
				limits: {
					maxFrameBytes: 2,
					maxPayloadBytes: 1,
					maxIdentifierBytes: 1,
					maxBatchItems: 1,
					maxJsonDepth: 1,
					maxEngineLayers: 1,
					maxTempoPoints: 1,
					maxMeterPoints: 1,
					maxMusicalEvents: 1,
					maxPreparedActions: 1,
					maxPreparedBeats: 1,
					maxActionsPerBlock: 1,
					maxVoices: 1,
					maxBlockFrames: 1,
					minSampleRate: 1,
					maxSampleRate: 1,
					maxOfflineSeconds: 1,
					maxPreviewEvents: 1,
					maxPreviewChordSize: 1,
					maxPreviewDurationMs: 1
				},
				commands: ['handshake'],
				events: ['ready'],
				capabilities: ['protocol.typed-json'],
				diagnosticCodes: ['protocol.invalid']
			})
		)
		assert.match(renderTypescriptBinding(schema), /engineProtocolVersion = 7/u)
		assert.match(renderRustBinding(schema), /ENGINE_PROTOCOL_VERSION: u32 = 7/u)
		assert.match(renderRustBinding(schema), /pub max_meter_points: usize/u)
		assert.match(
			renderRustBinding(schema),
			/max_prepared_beats: ENGINE_PROTOCOL_MAX_PREPARED_BEATS/u
		)
	})

	it('rejects duplicate stable codes', () => {
		assert.throws(
			() =>
				parseEngineProtocolSchema(
					JSON.stringify({
						schemaVersion: 1,
						engineProtocolVersion: 1,
						limits: {
							maxFrameBytes: 2,
							maxPayloadBytes: 1,
							maxIdentifierBytes: 1,
							maxBatchItems: 1,
							maxJsonDepth: 1,
							maxEngineLayers: 1,
							maxTempoPoints: 1,
							maxMeterPoints: 1,
							maxMusicalEvents: 1,
							maxPreparedActions: 1,
							maxPreparedBeats: 1,
							maxActionsPerBlock: 1,
							maxVoices: 1,
							maxBlockFrames: 1,
							minSampleRate: 1,
							maxSampleRate: 1,
							maxOfflineSeconds: 1,
							maxPreviewEvents: 1,
							maxPreviewChordSize: 1,
							maxPreviewDurationMs: 1
						},
						commands: ['play', 'play'],
						events: ['ready'],
						capabilities: ['protocol.typed-json'],
						diagnosticCodes: ['protocol.invalid']
					})
				),
			/commands must be a non-empty unique stable-code list/u
		)
	})
})
