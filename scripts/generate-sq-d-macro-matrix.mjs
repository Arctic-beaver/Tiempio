import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { resolveSynthPatch, synthPresetDefinition } =
	await import('../.test-out/packages/project-core/src/presets.js')
const { compileEngineWireSynthPatch } =
	await import('../.test-out/packages/project-core/src/render-plan.js')
const { engineRenderPlanVersion, engineTicksPerQuarter } =
	await import('../.test-out/packages/contracts/src/engine-render-plan.js')

const artifactPath = resolve('artifacts/sq-d-macro-matrix.json')
const macroIds = Object.freeze(['brightness', 'hardness', 'dirt', 'length', 'width'])
const representatives = Object.freeze([
	Object.freeze({
		family: 'bass',
		presetId: 'bass.warm',
		pitch: 40,
		spectralAnalysisStartFrame: 168_000
	}),
	Object.freeze({
		family: 'lead',
		presetId: 'lead.glass',
		pitch: 72,
		spectralAnalysisStartFrame: 168_000
	}),
	Object.freeze({
		family: 'pad',
		presetId: 'pad.soft',
		pitch: 60,
		spectralAnalysisStartFrame: 168_000
	}),
	Object.freeze({
		family: 'pluck',
		presetId: 'pluck.bell',
		pitch: 72,
		spectralAnalysisStartFrame: 2_400
	}),
	Object.freeze({
		family: 'texture',
		presetId: 'texture.mist',
		pitch: 60,
		spectralAnalysisStartFrame: 168_000
	})
])
const sweepValues = Object.freeze(Array.from({ length: 11 }, (_, index) => index / 10))

function probePlan({ family, pitch }, macro, value, patch) {
	const probeId = `${family}.${macro}.${String(Math.round(value * 10)).padStart(2, '0')}`
	return Object.freeze({
		planVersion: engineRenderPlanVersion,
		projectId: `project.sq-d.${probeId}`,
		projectRevision: 1,
		ticksPerQuarter: engineTicksPerQuarter,
		endTick: 21_120,
		tempoMap: Object.freeze([{ tick: 0, microBpm: 120_000_000 }]),
		meterMap: Object.freeze([{ tick: 0, numerator: 4, denominator: 4 }]),
		loop: Object.freeze({ enabled: false, startTick: 0, endTick: 21_120 }),
		layers: Object.freeze([
			Object.freeze({
				id: `layer.sq-d.${family}`,
				gain: 1,
				pan: 0,
				source: Object.freeze({
					type: 'subtractive-synth',
					patch: compileEngineWireSynthPatch(patch)
				}),
				events: Object.freeze([
					Object.freeze({
						id: `note.sq-d.${probeId}`,
						startTick: 0,
						durationTicks: 7_680,
						pitch,
						velocity: 96
					})
				])
			})
		])
	})
}

const probes = []
for (const representative of representatives) {
	const definition = synthPresetDefinition(representative.presetId)
	for (const macro of macroIds) {
		for (const value of sweepValues) {
			const macros = Object.freeze({ ...definition.defaultMacros, [macro]: value })
			const patch = resolveSynthPatch(representative.presetId, macros)
			probes.push(
				Object.freeze({
					family: representative.family,
					presetId: representative.presetId,
					macro,
					value,
					pitch: representative.pitch,
					spectralAnalysisStartFrame: representative.spectralAnalysisStartFrame,
					plan: probePlan(representative, macro, value, patch)
				})
			)
		}
	}
}

const matrix = Object.freeze({
	matrixRevision: 1,
	sampleRate: 48_000,
	blockFrames: 128,
	steadyAnalysisFrame: 168_000,
	probeCount: probes.length,
	probes: Object.freeze(probes)
})

mkdirSync(resolve('artifacts'), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(matrix, null, '\t')}\n`, 'utf8')
console.log(`PASS SQ-D macro matrix: ${String(probes.length)} current render plans.`)
