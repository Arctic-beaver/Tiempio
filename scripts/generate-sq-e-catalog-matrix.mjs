import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { createCleanPulseDrumSource, synthPresetCatalog, resolveSynthPatch } =
	await import('../.test-out/packages/project-core/src/presets.js')
const { compileEngineWireDrumPatch, compileEngineWireSynthPatch } =
	await import('../.test-out/packages/project-core/src/render-plan.js')
const { engineRenderPlanVersion, engineTicksPerQuarter } =
	await import('../.test-out/packages/contracts/src/engine-render-plan.js')

const artifactPath = resolve('artifacts/sq-e-catalog-matrix.json')
const sampleRates = Object.freeze([44_100, 48_000])
const velocities = Object.freeze([32, 80, 120])
const rolePitches = Object.freeze({
	bass: Object.freeze([28, 40, 55]),
	lead: Object.freeze([55, 69, 84]),
	pad: Object.freeze([48, 60, 76]),
	pluck: Object.freeze([48, 64, 84]),
	texture: Object.freeze([40, 60, 79])
})
const rolePositions = Object.freeze(['low', 'middle', 'high'])
const maximumProbes = 2_048
const renderEndTick = 15_360
const protectedDrumPatch = compileEngineWireDrumPatch(createCleanPulseDrumSource().resolvedPatch)

function note(id, startTick, durationTicks, pitch, velocity) {
	return Object.freeze({ id, startTick, durationTicks, pitch, velocity })
}

function drumHit(id, startTick, instrument, velocity) {
	return Object.freeze({ id, startTick, swingTicks: 0, instrument, velocity })
}

function midiFrequency(pitch) {
	return 440 * 2 ** ((pitch - 69) / 12)
}

function polyphonyEvents(family, pitch) {
	switch (family) {
		case 'bass':
			return [
				note('note.poly.0', 0, 3_840, pitch, 80),
				note('note.poly.1', 0, 3_840, pitch + 12, 72),
				note('note.poly.2', 2_880, 3_840, pitch, 88),
				note('note.poly.3', 3_360, 3_840, pitch + 7, 76)
			]
		case 'lead':
			return [
				note('note.poly.0', 0, 1_920, pitch, 80),
				note('note.poly.1', 0, 1_920, pitch + 7, 76),
				note('note.poly.2', 1_920, 1_920, pitch + 12, 96),
				note('note.poly.3', 3_840, 1_920, pitch, 88)
			]
		case 'pad':
			return [0, 4, 7, 12, 16, 19, 24, 28].map((offset, index) =>
				note(`note.poly.${String(index)}`, index * 120, 5_760, pitch + offset, 72)
			)
		case 'pluck':
			return [
				...Array.from({ length: 8 }, (_, index) =>
					note(
						`note.poly.${String(index)}`,
						index * 120,
						360,
						pitch + (index % 2) * 12,
						88
					)
				),
				note('note.poly.8', 1_440, 960, pitch, 80),
				note('note.poly.9', 1_440, 960, pitch + 4, 76),
				note('note.poly.10', 1_440, 960, pitch + 7, 72)
			]
		case 'texture':
			return [
				note('note.poly.0', 0, 5_760, pitch, 76),
				note('note.poly.1', 240, 5_520, pitch + 4, 72),
				note('note.poly.2', 480, 5_280, pitch + 7, 68)
			]
		default:
			throw new RangeError(`Unknown sound family ${String(family)}.`)
	}
}

function rolePhraseEvents(family, pitch) {
	switch (family) {
		case 'bass':
			return [0, 0, 7, 12, 5, 7, 0, -5].map((offset, index) =>
				note(
					`note.phrase.${String(index)}`,
					index * 720,
					840,
					pitch + offset,
					76 + (index % 3) * 8
				)
			)
		case 'lead':
			return [0, 2, 4, 7, 12, 7, 4, 2, 0, -5].map((offset, index) =>
				note(
					`note.phrase.${String(index)}`,
					index * 480,
					600,
					pitch + offset,
					68 + (index % 4) * 6
				)
			)
		case 'pad':
			return [
				...[0, 4, 7].map((offset, index) =>
					note(`note.phrase.a.${String(index)}`, 0, 2_640, pitch + offset, 68 + index * 4)
				),
				...[5, 9, 12].map((offset, index) =>
					note(
						`note.phrase.b.${String(index)}`,
						2_880,
						2_640,
						pitch + offset,
						72 + index * 4
					)
				)
			]
		case 'pluck':
			return [0, 7, 12, 4, 7, 16, 12, 7, 4, 0, -5, 0].map((offset, index) =>
				note(
					`note.phrase.${String(index)}`,
					index * 600,
					420,
					pitch + offset,
					72 + (index % 4) * 8
				)
			)
		case 'texture':
			return [
				note('note.phrase.0', 0, 5_280, pitch, 72),
				note('note.phrase.1', 960, 4_320, pitch + 7, 68),
				note('note.phrase.2', 2_880, 2_400, pitch + 12, 76)
			]
		default:
			throw new RangeError(`Unknown sound family ${String(family)}.`)
	}
}

function protectedDrumEvents() {
	const events = []
	for (let beat = 0; beat < 8; beat += 1) {
		const tick = beat * 960
		events.push(drumHit(`hit.hat.${String(beat * 2)}`, tick, 'closedHat', 72))
		events.push(drumHit(`hit.hat.${String(beat * 2 + 1)}`, tick + 480, 'closedHat', 64))
		if (beat % 2 === 0) events.push(drumHit(`hit.kick.${String(beat)}`, tick, 'kick', 104))
		else events.push(drumHit(`hit.clap.${String(beat)}`, tick, 'clap', 92))
	}
	events.push(drumHit('hit.open-hat', 7_200, 'openHat', 72))
	events.push(drumHit('hit.perc.0', 3_360, 'perc', 76))
	events.push(drumHit('hit.perc.1', 7_200, 'perc', 72))
	return events
}

function ordered(events) {
	return [...events].sort(
		(left, right) =>
			left.startTick - right.startTick ||
			(left.id < right.id ? -1 : left.id === right.id ? 0 : 1)
	)
}

function renderPlan(probeId, family, patch, events, drumEvents = []) {
	const orderedEvents = [...events].sort(
		(left, right) =>
			left.startTick - right.startTick ||
			(left.id < right.id ? -1 : left.id === right.id ? 0 : 1)
	)
	return Object.freeze({
		planVersion: engineRenderPlanVersion,
		projectId: `project.sq-e.${probeId}`,
		projectRevision: 1,
		ticksPerQuarter: engineTicksPerQuarter,
		endTick: renderEndTick,
		tempoMap: Object.freeze([{ tick: 0, microBpm: 120_000_000 }]),
		meterMap: Object.freeze([{ tick: 0, numerator: 4, denominator: 4 }]),
		loop: Object.freeze({ enabled: false, startTick: 0, endTick: renderEndTick }),
		layers: Object.freeze([
			Object.freeze({
				id: `layer.sq-e.${family}`,
				gain: drumEvents.length === 0 ? 1 : 0.82,
				pan: 0,
				source: Object.freeze({
					type: 'subtractive-synth',
					patch: compileEngineWireSynthPatch(patch)
				}),
				events: Object.freeze(orderedEvents)
			}),
			...(drumEvents.length === 0
				? []
				: [
						Object.freeze({
							id: 'layer.sq-e.protected-drums',
							gain: 0.36,
							pan: 0,
							source: Object.freeze({
								type: 'procedural-drums',
								patch: protectedDrumPatch
							}),
							events: Object.freeze(ordered(drumEvents))
						})
					])
		])
	})
}

const probes = []
for (const definition of synthPresetCatalog) {
	const patch = resolveSynthPatch(definition.id, definition.defaultMacros)
	const pitches = rolePitches[definition.family]
	for (const sampleRate of sampleRates) {
		const steadyAnalysisFrame = Math.round(sampleRate * 3)
		const spectralAnalysisStartFrame =
			definition.family === 'pluck' ? Math.round(sampleRate * 0.05) : steadyAnalysisFrame
		const stressSpectralAnalysisStartFrame = Math.round(sampleRate * 0.05)
		for (const [positionIndex, pitch] of pitches.entries()) {
			for (const velocity of velocities) {
				const probeId = `${definition.id}.${String(sampleRate)}.${rolePositions[positionIndex]}.${String(velocity)}`
				const durationTicks = definition.family === 'pluck' ? 3_840 : 7_680
				const events = [note(`note.${probeId}`, 0, durationTicks, pitch, velocity)]
				probes.push(
					Object.freeze({
						kind: 'single',
						family: definition.family,
						presetId: definition.id,
						rolePosition: rolePositions[positionIndex],
						velocity,
						pitch,
						expectedPitchHz:
							midiFrequency(pitch) * (patch.oscillator.subLevel >= 0.4 ? 0.5 : 1),
						sampleRate,
						steadyAnalysisFrame,
						spectralAnalysisStartFrame,
						plan: renderPlan(probeId, definition.family, patch, events)
					})
				)
			}
		}
		const middlePitch = pitches[1]
		for (const [kind, events, drums] of [
			['role-phrase', rolePhraseEvents(definition.family, middlePitch), []],
			['polyphony', polyphonyEvents(definition.family, middlePitch), []],
			[
				'protected-drum-mix',
				rolePhraseEvents(definition.family, middlePitch),
				protectedDrumEvents()
			]
		]) {
			const probeId = `${definition.id}.${String(sampleRate)}.${kind}`
			probes.push(
				Object.freeze({
					kind,
					family: definition.family,
					presetId: definition.id,
					rolePosition: 'middle',
					velocity: 80,
					pitch: middlePitch,
					expectedPitchHz:
						midiFrequency(middlePitch) * (patch.oscillator.subLevel >= 0.4 ? 0.5 : 1),
					sampleRate,
					steadyAnalysisFrame,
					spectralAnalysisStartFrame: stressSpectralAnalysisStartFrame,
					plan: renderPlan(probeId, definition.family, patch, events, drums)
				})
			)
		}
	}
}

if (probes.length > maximumProbes) {
	throw new RangeError(`SQ-E catalog matrix expands to ${String(probes.length)} probes.`)
}

const matrix = Object.freeze({
	matrixRevision: 1,
	blockFrames: 128,
	probeCount: probes.length,
	maximumProbes,
	probes: Object.freeze(probes)
})

mkdirSync(resolve('artifacts'), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(matrix, null, '\t')}\n`, 'utf8')
console.log(`PASS SQ-E catalog matrix: ${String(probes.length)} current render plans.`)
