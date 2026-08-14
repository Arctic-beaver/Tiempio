import { cloneAndFreeze } from './immutable.js'
import {
	macroMappingVersion,
	patchModelVersion,
	type DrumInstrument,
	type DrumSource,
	type DrumVoiceVariantId,
	type ResolvedDrumKitPatch,
	type ResolvedDrumVoicePatch,
	type ResolvedSynthPatch,
	type SemanticSynthMacros,
	type SoundFamily,
	type SynthInstrumentState,
	type SynthMacroId,
	type SynthPresetId,
	type SynthWaveform
} from './model.js'

export const synthPresetRevision = 1 as const
export const deepBassPresetRevision = synthPresetRevision

interface SynthPatchSeed {
	readonly attackMs: number
	readonly cutoffHz: number
	readonly decayMs: number
	readonly detuneCents: number
	readonly drive: number
	readonly envelopeAmount: number
	readonly movementDepth: number
	readonly movementRateHz: number
	readonly noiseLevel: number
	readonly outputGain: number
	readonly pulseWidth: number
	readonly releaseMs: number
	readonly resonance: number
	readonly secondaryDetuneCents: number
	readonly secondaryLevel: number
	readonly secondarySemitoneOffset: number
	readonly secondaryWaveform: SynthWaveform
	readonly stereoWidth: number
	readonly subLevel: number
	readonly sustain: number
	readonly waveform: SynthWaveform
}

export interface SynthPresetDefinition {
	readonly defaultMacros: SemanticSynthMacros
	readonly family: SoundFamily
	readonly id: SynthPresetId
	readonly mapping: SynthMacroProfile
	readonly name: string
	readonly seed: SynthPatchSeed
}

export interface SynthMacroProfile {
	readonly brightnessCompensationDb: number
	readonly brightnessKeyTrackingSpan: number
	readonly brightnessOctaves: number
	readonly brightnessSecondarySpan: number
	readonly brightnessSubTrimDb: number
	readonly dirtCompensationDb: number
	readonly dirtDriveTarget: number
	readonly dirtNoiseTarget: number
	readonly hardnessAmplitudeSpan: number
	readonly hardnessAttackOctaves: number
	readonly hardnessCompensationDb: number
	readonly hardnessEnvelopeSpan: number
	readonly hardnessResonanceSpan: number
	readonly lengthCompensationDb: number
	readonly lengthOctaves: number
	readonly lengthSustainSpan: number
	readonly outputGainCeiling: number
	readonly widthCompensationDb: number
	readonly widthDetuneSpanCents: number
	readonly widthMovementDepthSpan: number
	readonly widthMovementRateRatio: number
	readonly widthSecondarySpan: number
	readonly widthStereoSpan: number
}

interface SynthExpressionProfile {
	readonly amplitudeAmount: number
	readonly attackScale: number
	readonly filterOctaves: number
	readonly keyTracking: number
	readonly velocityCurve: number
}

const expressionProfiles: Readonly<Record<SoundFamily, SynthExpressionProfile>> = Object.freeze({
	bass: Object.freeze({
		amplitudeAmount: 0.9,
		attackScale: 0.45,
		filterOctaves: 1.25,
		keyTracking: 0.32,
		velocityCurve: 0.82
	}),
	lead: Object.freeze({
		amplitudeAmount: 0.88,
		attackScale: 0.55,
		filterOctaves: 1.6,
		keyTracking: 0.55,
		velocityCurve: 0.8
	}),
	pad: Object.freeze({
		amplitudeAmount: 0.82,
		attackScale: 0.7,
		filterOctaves: 1.1,
		keyTracking: 0.38,
		velocityCurve: 0.85
	}),
	pluck: Object.freeze({
		amplitudeAmount: 0.92,
		attackScale: 0.35,
		filterOctaves: 1.8,
		keyTracking: 0.65,
		velocityCurve: 0.75
	}),
	texture: Object.freeze({
		amplitudeAmount: 0.78,
		attackScale: 0.65,
		filterOctaves: 0.9,
		keyTracking: 0.28,
		velocityCurve: 0.9
	})
})

const familyMacroProfiles: Readonly<Record<SoundFamily, SynthMacroProfile>> = Object.freeze({
	bass: Object.freeze({
		brightnessCompensationDb: 0.8,
		brightnessKeyTrackingSpan: 0.08,
		brightnessOctaves: 2.1,
		brightnessSecondarySpan: 0.04,
		brightnessSubTrimDb: 3.4,
		dirtCompensationDb: 2.2,
		dirtDriveTarget: 0.78,
		dirtNoiseTarget: 0.12,
		hardnessAmplitudeSpan: 0.06,
		hardnessAttackOctaves: 1.8,
		hardnessCompensationDb: 0.7,
		hardnessEnvelopeSpan: 0.28,
		hardnessResonanceSpan: 0.14,
		lengthCompensationDb: 0,
		lengthOctaves: 1.9,
		lengthSustainSpan: 0.12,
		outputGainCeiling: 0.9,
		widthCompensationDb: 0.6,
		widthDetuneSpanCents: 0.6,
		widthMovementDepthSpan: 0.04,
		widthMovementRateRatio: 0.35,
		widthSecondarySpan: 0.05,
		widthStereoSpan: 0.32
	}),
	lead: Object.freeze({
		brightnessCompensationDb: 1.2,
		brightnessKeyTrackingSpan: 0.12,
		brightnessOctaves: 2.6,
		brightnessSecondarySpan: 0.08,
		brightnessSubTrimDb: 2.4,
		dirtCompensationDb: 2.8,
		dirtDriveTarget: 0.84,
		dirtNoiseTarget: 0.16,
		hardnessAmplitudeSpan: 0.08,
		hardnessAttackOctaves: 2.2,
		hardnessCompensationDb: 0.9,
		hardnessEnvelopeSpan: 0.36,
		hardnessResonanceSpan: 0.18,
		lengthCompensationDb: 0,
		lengthOctaves: 2.1,
		lengthSustainSpan: 0.16,
		outputGainCeiling: 0.9,
		widthCompensationDb: 1.1,
		widthDetuneSpanCents: 0,
		widthMovementDepthSpan: 0.12,
		widthMovementRateRatio: 0.55,
		widthSecondarySpan: 0.14,
		widthStereoSpan: 0.52
	}),
	pad: Object.freeze({
		brightnessCompensationDb: 1,
		brightnessKeyTrackingSpan: 0.08,
		brightnessOctaves: 2.3,
		brightnessSecondarySpan: 0.1,
		brightnessSubTrimDb: 2,
		dirtCompensationDb: 2.4,
		dirtDriveTarget: 0.68,
		dirtNoiseTarget: 0.24,
		hardnessAmplitudeSpan: 0.04,
		hardnessAttackOctaves: 1.4,
		hardnessCompensationDb: 0.5,
		hardnessEnvelopeSpan: 0.2,
		hardnessResonanceSpan: 0.1,
		lengthCompensationDb: 0,
		lengthOctaves: 2.4,
		lengthSustainSpan: 0.1,
		outputGainCeiling: 0.9,
		widthCompensationDb: 1.4,
		widthDetuneSpanCents: 0,
		widthMovementDepthSpan: 0.18,
		widthMovementRateRatio: 0.5,
		widthSecondarySpan: 0.2,
		widthStereoSpan: 0.58
	}),
	pluck: Object.freeze({
		brightnessCompensationDb: 1.4,
		brightnessKeyTrackingSpan: 0.14,
		brightnessOctaves: 2.8,
		brightnessSecondarySpan: 0.14,
		brightnessSubTrimDb: 2.2,
		dirtCompensationDb: 2,
		dirtDriveTarget: 0.62,
		dirtNoiseTarget: 0.1,
		hardnessAmplitudeSpan: 0.04,
		hardnessAttackOctaves: 2.8,
		hardnessCompensationDb: 1.1,
		hardnessEnvelopeSpan: 0.42,
		hardnessResonanceSpan: 0.22,
		lengthCompensationDb: 8.4,
		lengthOctaves: 2.7,
		lengthSustainSpan: 0.08,
		outputGainCeiling: 1.3,
		widthCompensationDb: 0.8,
		widthDetuneSpanCents: 3,
		widthMovementDepthSpan: 0.05,
		widthMovementRateRatio: 0.25,
		widthSecondarySpan: 0.1,
		widthStereoSpan: 0.14
	}),
	texture: Object.freeze({
		brightnessCompensationDb: 1,
		brightnessKeyTrackingSpan: 0.06,
		brightnessOctaves: 2,
		brightnessSecondarySpan: 0.16,
		brightnessSubTrimDb: 1.8,
		dirtCompensationDb: 3.1,
		dirtDriveTarget: 0.88,
		dirtNoiseTarget: 0.62,
		hardnessAmplitudeSpan: 0.05,
		hardnessAttackOctaves: 1.8,
		hardnessCompensationDb: 0.7,
		hardnessEnvelopeSpan: 0.24,
		hardnessResonanceSpan: 0.16,
		lengthCompensationDb: 0,
		lengthOctaves: 2.3,
		lengthSustainSpan: 0.12,
		outputGainCeiling: 0.9,
		widthCompensationDb: 1.5,
		widthDetuneSpanCents: 16,
		widthMovementDepthSpan: 0.22,
		widthMovementRateRatio: 0.65,
		widthSecondarySpan: 0.18,
		widthStereoSpan: 0.6
	})
})

const macros = (
	brightness: number,
	hardness: number,
	dirt: number,
	length: number,
	width: number
): SemanticSynthMacros => Object.freeze({ brightness, hardness, dirt, length, width })

const seed = (
	waveform: SynthWaveform,
	cutoffHz: number,
	attackMs: number,
	releaseMs: number,
	options: Partial<SynthPatchSeed> = {}
): SynthPatchSeed =>
	Object.freeze({
		waveform,
		cutoffHz,
		attackMs,
		releaseMs,
		decayMs: options.decayMs ?? 220,
		sustain: options.sustain ?? 0.62,
		resonance: options.resonance ?? 0.22,
		envelopeAmount: options.envelopeAmount ?? 0.42,
		detuneCents: options.detuneCents ?? 0,
		subLevel: options.subLevel ?? 0.18,
		noiseLevel: options.noiseLevel ?? 0,
		pulseWidth: options.pulseWidth ?? 0.5,
		drive: options.drive ?? 0.04,
		stereoWidth: options.stereoWidth ?? 0.16,
		movementRateHz: options.movementRateHz ?? 0,
		movementDepth: options.movementDepth ?? 0,
		secondaryWaveform: options.secondaryWaveform ?? waveform,
		secondarySemitoneOffset: options.secondarySemitoneOffset ?? 0,
		secondaryDetuneCents: options.secondaryDetuneCents ?? 0,
		secondaryLevel: options.secondaryLevel ?? 0,
		outputGain: options.outputGain ?? 0.68
	})

const preset = (
	id: SynthPresetId,
	name: string,
	defaultMacros: SemanticSynthMacros,
	patchSeed: SynthPatchSeed,
	mappingOverrides: Partial<SynthMacroProfile> = {}
): SynthPresetDefinition =>
	(() => {
		const family = id.slice(0, id.indexOf('.')) as SoundFamily
		return Object.freeze({
			id,
			name,
			family,
			defaultMacros,
			seed: patchSeed,
			mapping: Object.freeze({ ...familyMacroProfiles[family], ...mappingOverrides })
		})
	})()

export const synthPresetCatalog: readonly SynthPresetDefinition[] = Object.freeze([
	preset(
		'bass.deep',
		'Deep',
		macros(0.24, 0.38, 0.12, 0.7, 0.08),
		seed('saw', 190, 24, 400, { subLevel: 0.78, outputGain: 0.84 })
	),
	preset(
		'bass.punchy',
		'Punchy',
		macros(0.48, 0.84, 0.18, 0.34, 0.08),
		seed('square', 520, 3, 120, {
			decayMs: 110,
			sustain: 0.38,
			envelopeAmount: 0.72,
			outputGain: 0.57
		})
	),
	preset(
		'bass.warm',
		'Warm',
		macros(0.34, 0.3, 0.08, 0.72, 0.18),
		seed('triangle', 430, 18, 460, {
			subLevel: 0.62,
			drive: 0.08,
			secondaryWaveform: 'sine',
			secondarySemitoneOffset: 12,
			secondaryLevel: 0.1,
			outputGain: 0.82
		})
	),
	preset(
		'bass.dirty',
		'Dirty',
		macros(0.5, 0.66, 0.76, 0.5, 0.14),
		seed('saw', 690, 6, 240, { subLevel: 0.46, drive: 0.38, resonance: 0.3, outputGain: 0.6 })
	),
	preset(
		'bass.soft',
		'Soft',
		macros(0.18, 0.16, 0.02, 0.82, 0.24),
		seed('sine', 320, 48, 580, { subLevel: 0.48, envelopeAmount: 0.18, outputGain: 0.63 })
	),
	preset(
		'bass.retro',
		'Retro',
		macros(0.44, 0.58, 0.24, 0.48, 0.04),
		seed('square', 760, 8, 190, { pulseWidth: 0.38, drive: 0.16, outputGain: 0.42 })
	),
	preset(
		'lead.glass',
		'Glass',
		macros(0.86, 0.48, 0.02, 0.46, 0.62),
		seed('triangle', 5200, 8, 360, {
			resonance: 0.34,
			movementRateHz: 0.35,
			movementDepth: 0.08,
			secondaryWaveform: 'sine',
			secondarySemitoneOffset: 12,
			secondaryDetuneCents: 6,
			secondaryLevel: 0.2,
			outputGain: 0.6
		})
	),
	preset(
		'lead.neon',
		'Neon',
		macros(0.78, 0.7, 0.16, 0.38, 0.72),
		seed('saw', 3900, 4, 260, {
			detuneCents: 5,
			drive: 0.12,
			movementRateHz: 4.2,
			movementDepth: 0.12,
			outputGain: 0.65
		})
	),
	preset(
		'lead.velvet',
		'Velvet',
		macros(0.46, 0.3, 0.04, 0.68, 0.56),
		seed('triangle', 2100, 24, 520, { sustain: 0.74, outputGain: 0.43 })
	),
	preset(
		'lead.hollow',
		'Hollow',
		macros(0.38, 0.42, 0.12, 0.62, 0.7),
		seed('square', 1700, 12, 440, {
			pulseWidth: 0.28,
			resonance: 0.46,
			movementRateHz: 0.22,
			movementDepth: 0.14,
			outputGain: 0.47
		})
	),
	preset(
		'lead.razor',
		'Razor',
		macros(0.94, 0.9, 0.4, 0.24, 0.34),
		seed('saw', 7200, 1, 90, { resonance: 0.28, drive: 0.26, outputGain: 0.46 })
	),
	preset(
		'lead.voice',
		'Voice',
		macros(0.58, 0.26, 0.06, 0.7, 0.68),
		seed('square', 1400, 36, 620, {
			pulseWidth: 0.42,
			resonance: 0.58,
			movementRateHz: 5.1,
			movementDepth: 0.06,
			outputGain: 0.35
		})
	),
	preset(
		'lead.solar',
		'Solar',
		macros(0.9, 0.56, 0.1, 0.52, 0.82),
		seed('saw', 6100, 7, 480, {
			detuneCents: 8,
			movementRateHz: 0.16,
			movementDepth: 0.18,
			outputGain: 0.65
		})
	),
	preset(
		'pad.soft',
		'Soft',
		macros(0.24, 0.1, 0.01, 0.92, 0.82),
		seed('sine', 1100, 420, 1800, {
			sustain: 0.86,
			movementRateHz: 0.1,
			movementDepth: 0.05,
			secondaryWaveform: 'triangle',
			secondarySemitoneOffset: 12,
			secondaryDetuneCents: 5,
			secondaryLevel: 0.12,
			outputGain: 0.38
		})
	),
	preset(
		'pad.warm',
		'Warm',
		macros(0.38, 0.18, 0.08, 0.9, 0.76),
		seed('triangle', 1500, 320, 1600, {
			drive: 0.08,
			sustain: 0.82,
			movementRateHz: 0.14,
			movementDepth: 0.08,
			secondaryWaveform: 'saw',
			secondaryDetuneCents: 7,
			secondaryLevel: 0.18,
			outputGain: 0.5
		})
	),
	preset(
		'pad.air',
		'Air',
		macros(0.72, 0.08, 0.02, 0.94, 0.94),
		seed('triangle', 4700, 620, 2200, {
			noiseLevel: 0.18,
			sustain: 0.9,
			movementRateHz: 0.08,
			movementDepth: 0.16,
			outputGain: 0.46
		})
	),
	preset(
		'pad.motion',
		'Motion',
		macros(0.56, 0.34, 0.12, 0.86, 0.9),
		seed('saw', 2400, 240, 1500, {
			movementRateHz: 0.48,
			movementDepth: 0.32,
			outputGain: 0.54
		})
	),
	preset(
		'pad.dust',
		'Dust',
		macros(0.42, 0.12, 0.48, 0.88, 0.86),
		seed('triangle', 1800, 380, 1900, {
			noiseLevel: 0.3,
			drive: 0.14,
			movementRateHz: 0.12,
			movementDepth: 0.2,
			outputGain: 0.68
		})
	),
	preset(
		'pluck.glass',
		'Glass',
		macros(0.9, 0.72, 0.02, 0.12, 0.46),
		seed('triangle', 7800, 1, 80, {
			decayMs: 150,
			sustain: 0.02,
			resonance: 0.48,
			secondaryWaveform: 'sine',
			secondarySemitoneOffset: 12,
			secondaryLevel: 0.24,
			outputGain: 0.85
		})
	),
	preset(
		'pluck.wood',
		'Wood',
		macros(0.42, 0.68, 0.1, 0.18, 0.22),
		seed('triangle', 1700, 2, 110, {
			decayMs: 210,
			sustain: 0.03,
			noiseLevel: 0.04,
			outputGain: 0.64
		})
	),
	preset(
		'pluck.bell',
		'Bell',
		macros(0.82, 0.42, 0.01, 0.34, 0.58),
		seed('sine', 6900, 1, 520, {
			decayMs: 680,
			sustain: 0.04,
			movementRateHz: 6.4,
			movementDepth: 0.04,
			secondaryWaveform: 'sine',
			secondarySemitoneOffset: 12,
			secondaryLevel: 0.32,
			outputGain: 0.36
		})
	),
	preset(
		'pluck.short',
		'Short',
		macros(0.54, 0.88, 0.08, 0.04, 0.12),
		seed('square', 3200, 1, 35, { decayMs: 70, sustain: 0, outputGain: 0.66 })
	),
	preset(
		'texture.grain',
		'Grain',
		macros(0.58, 0.44, 0.52, 0.52, 0.86),
		seed('saw', 2500, 22, 680, {
			noiseLevel: 0.26,
			drive: 0.18,
			movementRateHz: 7.5,
			movementDepth: 0.22,
			secondaryWaveform: 'square',
			secondarySemitoneOffset: 12,
			secondaryDetuneCents: 9,
			secondaryLevel: 0.14,
			outputGain: 0.51
		})
	),
	preset(
		'texture.mist',
		'Mist',
		macros(0.66, 0.06, 0.18, 0.94, 0.98),
		seed('sine', 4200, 720, 2600, {
			noiseLevel: 0.22,
			sustain: 0.9,
			movementRateHz: 0.06,
			movementDepth: 0.24,
			secondaryWaveform: 'triangle',
			secondarySemitoneOffset: 12,
			secondaryDetuneCents: 8,
			secondaryLevel: 0.2,
			outputGain: 0.32
		})
	),
	preset(
		'texture.pulse',
		'Pulse',
		macros(0.52, 0.72, 0.2, 0.42, 0.78),
		seed('square', 2200, 4, 260, {
			pulseWidth: 0.24,
			movementRateHz: 3.8,
			movementDepth: 0.38,
			outputGain: 0.42
		})
	),
	preset(
		'texture.dust',
		'Dust',
		macros(0.36, 0.14, 0.72, 0.78, 0.92),
		seed('triangle', 1300, 180, 1200, {
			noiseLevel: 0.46,
			drive: 0.2,
			movementRateHz: 0.18,
			movementDepth: 0.26,
			outputGain: 0.54
		})
	),
	preset(
		'texture.wire',
		'Wire',
		macros(0.84, 0.82, 0.32, 0.28, 0.52),
		seed('saw', 6400, 2, 160, {
			resonance: 0.56,
			drive: 0.18,
			movementRateHz: 8.2,
			movementDepth: 0.16,
			outputGain: 0.38
		})
	)
])

export const deepBassDefaultMacros = synthPresetCatalog[0]!.defaultMacros

const catalogById = new Map(synthPresetCatalog.map((definition) => [definition.id, definition]))

function rounded(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000
}

function bounded(value: number, minimum: number, maximum: number): number {
	return rounded(Math.min(maximum, Math.max(minimum, value)))
}

function smoothstep(value: number): number {
	const unit = Math.min(1, Math.max(0, value))
	return unit * unit * (3 - 2 * unit)
}

function macroDelta(value: number, defaultValue: number): number {
	if (value === defaultValue) return 0
	const centered = (value - defaultValue) * 2
	return Math.sign(centered) * smoothstep(Math.min(1, Math.abs(centered)))
}

function toward(value: number, delta: number, minimum: number, maximum: number): number {
	return delta >= 0 ? value + (maximum - value) * delta : value + (value - minimum) * delta
}

function octaveScale(octaves: number, delta: number): number {
	return 2 ** (octaves * delta)
}

function decibelGain(decibels: number): number {
	return 10 ** (decibels / 20)
}

export function assertMacroValue(value: number): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError('A semantic macro value must be finite and between 0 and 1.')
	}
	return value
}

export function synthPresetDefinition(presetId: SynthPresetId): SynthPresetDefinition {
	const definition = catalogById.get(presetId)
	if (definition === undefined) throw new RangeError(`Unknown synth preset ${presetId}.`)
	return definition
}

export function synthPresetsForFamily(family: SoundFamily): readonly SynthPresetDefinition[] {
	return synthPresetCatalog.filter((definition) => definition.family === family)
}

export function resolveSynthPatch(
	presetId: SynthPresetId,
	macrosValue: SemanticSynthMacros
): ResolvedSynthPatch {
	for (const value of Object.values(macrosValue)) assertMacroValue(value)
	const definition = synthPresetDefinition(presetId)
	const { defaultMacros, mapping, seed: patchSeed } = definition
	const expressionProfile = expressionProfiles[definition.family]
	const brightness = macroDelta(macrosValue.brightness, defaultMacros.brightness)
	const hardness = macroDelta(macrosValue.hardness, defaultMacros.hardness)
	const dirt = macroDelta(macrosValue.dirt, defaultMacros.dirt)
	const length = macroDelta(macrosValue.length, defaultMacros.length)
	const width = macroDelta(macrosValue.width, defaultMacros.width)
	const lengthScale = octaveScale(mapping.lengthOctaves, length)
	const compensationDb = -(
		brightness * mapping.brightnessCompensationDb +
		hardness * mapping.hardnessCompensationDb +
		dirt * mapping.dirtCompensationDb +
		length * mapping.lengthCompensationDb +
		width * mapping.widthCompensationDb
	)
	return cloneAndFreeze({
		patchModelVersion,
		voice: 'subtractive-synth',
		oscillator: {
			waveform: patchSeed.waveform,
			detuneCents: bounded(
				toward(
					patchSeed.detuneCents,
					width,
					0,
					patchSeed.detuneCents + mapping.widthDetuneSpanCents
				),
				-48,
				48
			),
			subLevel: bounded(
				patchSeed.subLevel * decibelGain(-brightness * mapping.brightnessSubTrimDb),
				0,
				1
			),
			noiseLevel: bounded(
				toward(patchSeed.noiseLevel, dirt, 0, mapping.dirtNoiseTarget),
				0,
				1
			),
			pulseWidth: patchSeed.pulseWidth,
			secondary: {
				waveform: patchSeed.secondaryWaveform,
				semitoneOffset: patchSeed.secondarySemitoneOffset,
				detuneCents: patchSeed.secondaryDetuneCents,
				level: bounded(
					patchSeed.secondaryLevel +
						brightness * mapping.brightnessSecondarySpan +
						width * mapping.widthSecondarySpan,
					0,
					1
				)
			}
		},
		filter: {
			cutoffHz: bounded(
				patchSeed.cutoffHz * octaveScale(mapping.brightnessOctaves, brightness),
				40,
				18_000
			),
			resonance: bounded(
				patchSeed.resonance + hardness * mapping.hardnessResonanceSpan,
				0,
				0.86
			),
			envelopeAmount: bounded(
				patchSeed.envelopeAmount + hardness * mapping.hardnessEnvelopeSpan,
				-0.8,
				0.94
			),
			keyTracking: bounded(
				expressionProfile.keyTracking + brightness * mapping.brightnessKeyTrackingSpan,
				0,
				1.5
			)
		},
		amplifier: {
			attackMs: bounded(
				patchSeed.attackMs * octaveScale(-mapping.hardnessAttackOctaves, hardness),
				0.5,
				4000
			),
			decayMs: bounded(patchSeed.decayMs * lengthScale, 12, 5000),
			sustain: bounded(patchSeed.sustain + length * mapping.lengthSustainSpan, 0, 0.96),
			releaseMs: bounded(patchSeed.releaseMs * lengthScale, 8, 6000)
		},
		movement: {
			rateHz: bounded(
				patchSeed.movementRateHz * (1 + width * mapping.widthMovementRateRatio),
				0,
				12
			),
			depth: bounded(
				toward(
					patchSeed.movementDepth,
					width,
					0,
					patchSeed.movementDepth + mapping.widthMovementDepthSpan
				),
				0,
				0.72
			)
		},
		expression: {
			amplitudeAmount: bounded(
				expressionProfile.amplitudeAmount + hardness * mapping.hardnessAmplitudeSpan,
				0,
				1
			),
			attackScale: bounded(
				expressionProfile.attackScale * octaveScale(-0.35, hardness),
				0,
				2
			),
			filterOctaves: bounded(
				expressionProfile.filterOctaves * octaveScale(0.45, brightness),
				0,
				4
			),
			velocityCurve: bounded(
				expressionProfile.velocityCurve * octaveScale(-0.25, hardness),
				0.25,
				4
			)
		},
		drive: bounded(toward(patchSeed.drive, dirt, 0, mapping.dirtDriveTarget), 0, 0.92),
		stereoWidth: bounded(
			toward(
				patchSeed.stereoWidth,
				width,
				0,
				patchSeed.stereoWidth + mapping.widthStereoSpan
			),
			0,
			1
		),
		outputGain: bounded(
			patchSeed.outputGain * decibelGain(compensationDb),
			0,
			mapping.outputGainCeiling
		)
	})
}

export function createSynthInstrument(
	presetId: SynthPresetId = 'bass.deep',
	macrosValue: SemanticSynthMacros = synthPresetDefinition(presetId).defaultMacros
): SynthInstrumentState {
	const definition = synthPresetDefinition(presetId)
	const ownedMacros = cloneAndFreeze(macrosValue)
	return cloneAndFreeze({
		family: definition.family,
		presetId,
		presetRevision: synthPresetRevision,
		macroMappingVersion,
		macros: ownedMacros,
		resolvedPatch: resolveSynthPatch(presetId, ownedMacros)
	})
}

export function updateSynthMacro(
	instrument: SynthInstrumentState,
	macro: SynthMacroId,
	value: number
): SynthInstrumentState {
	assertMacroValue(value)
	return createSynthInstrument(instrument.presetId, { ...instrument.macros, [macro]: value })
}

export const createDeepBassInstrument = (
	macrosValue: SemanticSynthMacros = deepBassDefaultMacros
): SynthInstrumentState => createSynthInstrument('bass.deep', macrosValue)

export const resolveDeepBassPatch = (macrosValue: SemanticSynthMacros): ResolvedSynthPatch =>
	resolveSynthPatch('bass.deep', macrosValue)

export const updateDeepBassMacro = updateSynthMacro

interface DrumVoiceVariantDefinition extends ResolvedDrumVoicePatch {
	readonly instrument: DrumInstrument
}

const drumVoice = (
	instrument: DrumInstrument,
	variantId: DrumVoiceVariantId,
	algorithm: ResolvedDrumVoicePatch['algorithm'],
	pitchHz: number,
	tone: number,
	decayMs: number,
	noise: number,
	drive: number,
	gain: number
): DrumVoiceVariantDefinition =>
	Object.freeze({ instrument, variantId, algorithm, pitchHz, tone, decayMs, noise, drive, gain })

export const drumVoiceVariantCatalog: readonly DrumVoiceVariantDefinition[] = Object.freeze([
	drumVoice('kick', 'kick.deep', 'kick', 52, 0.34, 420, 0.02, 0.18, 0.82),
	drumVoice('kick', 'kick.tight', 'kick', 68, 0.56, 210, 0.01, 0.1, 0.76),
	drumVoice('kick', 'kick.soft', 'kick', 46, 0.24, 520, 0.04, 0.04, 0.72),
	drumVoice('clap', 'clap.clean', 'clap', 1260, 0.66, 180, 0.88, 0.04, 0.58),
	drumVoice('clap', 'clap.wide', 'clap', 980, 0.54, 260, 0.94, 0.08, 0.54),
	drumVoice('clap', 'clap.dry', 'clap', 1540, 0.74, 105, 0.8, 0.02, 0.6),
	drumVoice('closedHat', 'closedHat.fine', 'closed-hat', 7200, 0.82, 72, 1, 0.02, 0.38),
	drumVoice('closedHat', 'closedHat.dark', 'closed-hat', 4800, 0.46, 96, 1, 0.02, 0.42),
	drumVoice('closedHat', 'closedHat.crisp', 'closed-hat', 9200, 0.96, 54, 1, 0.05, 0.34),
	drumVoice('openHat', 'openHat.air', 'open-hat', 6800, 0.76, 480, 1, 0.02, 0.34),
	drumVoice('openHat', 'openHat.short', 'open-hat', 6100, 0.7, 260, 1, 0.03, 0.38),
	drumVoice('openHat', 'openHat.bright', 'open-hat', 8900, 0.94, 390, 1, 0.04, 0.32),
	drumVoice('perc', 'perc.glass', 'perc', 680, 0.86, 330, 0.16, 0.04, 0.52),
	drumVoice('perc', 'perc.wood', 'perc', 240, 0.38, 190, 0.24, 0.08, 0.62),
	drumVoice('perc', 'perc.low', 'perc', 132, 0.24, 380, 0.12, 0.12, 0.66)
])

export const defaultDrumVoiceVariants: Readonly<Record<DrumInstrument, DrumVoiceVariantId>> =
	Object.freeze({
		kick: 'kick.deep',
		clap: 'clap.clean',
		closedHat: 'closedHat.fine',
		openHat: 'openHat.air',
		perc: 'perc.glass'
	})

const drumVariantById = new Map(
	drumVoiceVariantCatalog.map((definition) => [definition.variantId, definition])
)

export function drumVoiceVariantsFor(
	instrument: DrumInstrument
): readonly DrumVoiceVariantDefinition[] {
	return drumVoiceVariantCatalog.filter((definition) => definition.instrument === instrument)
}

export function resolveDrumKitPatch(
	voiceVariants: Readonly<Record<DrumInstrument, DrumVoiceVariantId>>
): ResolvedDrumKitPatch {
	const voices = {} as Record<DrumInstrument, ResolvedDrumVoicePatch>
	for (const instrument of ['kick', 'clap', 'closedHat', 'openHat', 'perc'] as const) {
		const variantId = voiceVariants[instrument]
		const definition = drumVariantById.get(variantId)
		if (definition === undefined || definition.instrument !== instrument) {
			throw new RangeError(`Drum voice ${variantId} does not belong to ${instrument}.`)
		}
		voices[instrument] = {
			variantId: definition.variantId,
			algorithm: definition.algorithm,
			pitchHz: definition.pitchHz,
			tone: definition.tone,
			decayMs: definition.decayMs,
			noise: definition.noise,
			drive: definition.drive,
			gain: definition.gain
		}
	}
	return cloneAndFreeze({ patchModelVersion, voices })
}

export function createCleanPulseDrumSource(
	voiceVariants: Readonly<Record<DrumInstrument, DrumVoiceVariantId>> = defaultDrumVoiceVariants
): DrumSource {
	const ownedVariants = cloneAndFreeze(voiceVariants)
	return cloneAndFreeze({
		type: 'drum',
		kitId: 'drums.clean-pulse',
		kitRevision: 1,
		voiceVariants: ownedVariants,
		resolvedPatch: resolveDrumKitPatch(ownedVariants)
	})
}

export function updateDrumVoiceVariant(
	source: DrumSource,
	instrument: DrumInstrument,
	variantId: DrumVoiceVariantId
): DrumSource {
	return createCleanPulseDrumSource({ ...source.voiceVariants, [instrument]: variantId })
}
