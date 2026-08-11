import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createLayer,
	createProject,
	firstProjectSchemaVersion,
	legacyEngineModelVersion,
	legacyMacroMappingVersion,
	legacyPatchModelVersion,
	loadProjectDocument,
	patchModelVersion,
	previousProjectSchemaVersion,
	projectSchemaVersion
} from './index.js'

describe('project migrations', () => {
	it('migrates the legacy v0 transport deterministically', () => {
		const result = loadProjectDocument({
			schemaVersion: 0,
			projectId: 'project.legacy',
			title: 'Legacy',
			tempo: 122,
			key: { tonic: 7, mode: 'minor' }
		})
		assert.equal(result.status, 'loaded')
		if (result.status !== 'loaded') return
		assert.equal(result.migratedFromSchemaVersion, 0)
		assert.equal(result.project.transport.tempoMap[0]?.bpm, 122)
		assert.deepEqual(result.project.transport.meterMap[0], {
			tick: 0,
			numerator: 4,
			denominator: 4
		})
	})

	it('migrates v1 pitched layers to explicit per-instrument performance mappings', () => {
		const project = createProject({ projectId: 'project.v1', title: 'Previous' })
		const layer = createLayer({ id: 'layer.v1', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const result = loadProjectDocument({
			...project,
			schemaVersion: firstProjectSchemaVersion,
			engineModelVersion: legacyEngineModelVersion,
			layers: [
				{
					...layer,
					source: { type: 'synth', instrument: layer.source.instrument }
				}
			]
		})
		assert.equal(result.status, 'loaded')
		if (result.status !== 'loaded') return
		assert.equal(result.migratedFromSchemaVersion, firstProjectSchemaVersion)
		const migrated = result.project.layers[0]
		assert.equal(migrated?.source.type, 'synth')
		if (migrated?.source.type === 'synth') {
			assert.deepEqual(migrated.source.performance, {
				key: { tonic: 9, mode: 'minor' },
				octave: 2
			})
		}
	})

	it('migrates schema v2 Deep Bass and basic drums into the current catalog', () => {
		const project = createProject({ projectId: 'project.v2', title: 'Version two' })
		const bass = createLayer({ id: 'layer.v2.bass', name: 'Bass', role: 'bass' })
		const drums = createLayer({ id: 'layer.v2.drums', name: 'Drums', role: 'rhythm' })
		assert.equal(bass.source.type, 'synth')
		if (bass.source.type !== 'synth') return
		const legacyBass = {
			...bass,
			source: {
				type: 'synth',
				performance: bass.source.performance,
				instrument: {
					family: 'bass',
					presetId: 'bass.deep',
					presetRevision: 1,
					macroMappingVersion: legacyMacroMappingVersion,
					macros: bass.source.instrument.macros,
					resolvedPatch: {
						patchModelVersion: legacyPatchModelVersion,
						voice: 'subtractive-bass',
						oscillator: { waveform: 'saw', detuneCents: 0, subLevel: 0.7 },
						filter: { cutoffHz: 300, resonance: 0.3, envelopeAmount: 0.4 },
						amplifier: { attackMs: 20, decayMs: 200, sustain: 0.6, releaseMs: 300 },
						drive: 0.1,
						stereoWidth: 0.1,
						outputGain: 0.7
					}
				}
			}
		}
		const legacyDrums = {
			...drums,
			source: {
				type: 'drum',
				kitId: 'drums.basic',
				kitRevision: 1,
				patchModelVersion: legacyPatchModelVersion
			},
			clips: [
				{
					kind: 'drum',
					id: 'clip.v2.drums',
					startTick: 0,
					lengthTicks: 3840,
					sectionId: null,
					loop: true,
					pattern: { stepCount: 16, stepsPerQuarter: 4 },
					events: [
						{ id: 'event.v2.snare', instrument: 'snare', step: 4, velocity: 100 },
						{ id: 'event.v2.hat', instrument: 'hat', step: 2, velocity: 80 }
					]
				}
			]
		}
		const result = loadProjectDocument({
			...project,
			schemaVersion: previousProjectSchemaVersion,
			engineModelVersion: legacyEngineModelVersion,
			layers: [legacyBass, legacyDrums]
		})
		assert.equal(result.status, 'loaded')
		if (result.status !== 'loaded') return
		assert.equal(result.migratedFromSchemaVersion, previousProjectSchemaVersion)
		const migratedBass = result.project.layers[0]
		assert.equal(migratedBass?.source.type, 'synth')
		if (migratedBass?.source.type === 'synth') {
			assert.equal(migratedBass.source.instrument.presetId, 'bass.deep')
			assert.equal(migratedBass.source.instrument.resolvedPatch.voice, 'subtractive-synth')
		}
		const migratedDrums = result.project.layers[1]
		assert.equal(migratedDrums?.source.type, 'drum')
		if (migratedDrums?.source.type === 'drum') {
			assert.equal(migratedDrums.source.kitId, 'drums.clean-pulse')
		}
		const clip = migratedDrums?.clips[0]
		assert.equal(clip?.kind, 'drum')
		if (clip?.kind === 'drum') {
			assert.deepEqual(
				clip.events.map((event) => event.instrument),
				['clap', 'closedHat']
			)
			assert.equal(clip.character, 'custom')
			assert.equal(clip.swing, 0.08)
		}
	})

	it('reports future schemas as unsupported instead of destructively loading them', () => {
		const result = loadProjectDocument({ schemaVersion: projectSchemaVersion + 1 })
		assert.equal(result.status, 'unsupported')
		if (result.status === 'unsupported') {
			assert.equal(result.schemaVersion, projectSchemaVersion + 1)
		}
	})

	it('reports future resolved patch models as unsupported', () => {
		const project = createProject({ projectId: 'project.future-patch', title: 'Future patch' })
		const layer = createLayer({ id: 'layer.bass', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const futureLayer = {
			...layer,
			source: {
				...layer.source,
				instrument: {
					...layer.source.instrument,
					resolvedPatch: {
						...layer.source.instrument.resolvedPatch,
						patchModelVersion: patchModelVersion + 1
					}
				}
			}
		}
		const result = loadProjectDocument({ ...project, layers: [futureLayer] })
		assert.equal(result.status, 'unsupported')
		if (result.status === 'unsupported') {
			assert.equal(result.patchVersion, patchModelVersion + 1)
		}
	})
})
