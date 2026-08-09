import { cloneAndFreeze } from './immutable.js'
import {
	macroMappingVersion,
	patchModelVersion,
	type BassInstrumentStateV1,
	type BassMacroId,
	type ResolvedBassPatchV1,
	type SemanticBassMacrosV1
} from './model.js'

export const deepBassPresetRevision = 1 as const

export const deepBassDefaultMacros: SemanticBassMacrosV1 = Object.freeze({
	brightness: 0.24,
	hardness: 0.38,
	dirt: 0.12,
	length: 0.7,
	width: 0.08
})

function rounded(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000
}

export function assertMacroValue(value: number): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError('A semantic macro value must be finite and between 0 and 1.')
	}
	return value
}

export function resolveDeepBassPatch(macros: SemanticBassMacrosV1): ResolvedBassPatchV1 {
	for (const value of Object.values(macros)) assertMacroValue(value)
	return cloneAndFreeze({
		patchModelVersion,
		voice: 'subtractive-bass',
		oscillator: {
			waveform: 'saw',
			detuneCents: rounded((macros.width - 0.5) * 8),
			subLevel: rounded(0.82 - macros.brightness * 0.24)
		},
		filter: {
			cutoffHz: rounded(72 + macros.brightness * 1128),
			resonance: rounded(0.18 + macros.hardness * 0.42),
			envelopeAmount: rounded(0.16 + macros.hardness * 0.7)
		},
		amplifier: {
			attackMs: rounded(38 - macros.hardness * 34),
			decayMs: rounded(90 + macros.length * 310),
			sustain: rounded(0.38 + macros.length * 0.48),
			releaseMs: rounded(45 + macros.length * 455)
		},
		drive: rounded(macros.dirt * 0.72),
		stereoWidth: rounded(macros.width * 0.35),
		outputGain: rounded(0.72 - macros.dirt * 0.12)
	})
}

export function createDeepBassInstrument(
	macros: SemanticBassMacrosV1 = deepBassDefaultMacros
): BassInstrumentStateV1 {
	const ownedMacros = cloneAndFreeze(macros)
	return cloneAndFreeze({
		family: 'bass',
		presetId: 'bass.deep',
		presetRevision: deepBassPresetRevision,
		macroMappingVersion,
		macros: ownedMacros,
		resolvedPatch: resolveDeepBassPatch(ownedMacros)
	})
}

export function updateDeepBassMacro(
	instrument: BassInstrumentStateV1,
	macro: BassMacroId,
	value: number
): BassInstrumentStateV1 {
	assertMacroValue(value)
	return createDeepBassInstrument({ ...instrument.macros, [macro]: value })
}
