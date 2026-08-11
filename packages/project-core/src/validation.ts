import { cloneAndFreeze } from './immutable.js'
import {
	defaultTicksPerQuarter,
	engineModelVersion,
	isOpaqueId,
	macroMappingVersion,
	patchModelVersion,
	projectLimits,
	projectSchemaVersion,
	type ProjectDocument
} from './model.js'
import {
	createCleanPulseDrumSource,
	createSynthInstrument,
	drumVoiceVariantCatalog,
	synthPresetCatalog
} from './presets.js'

export type ProjectValidationIssueCode =
	| 'CYCLE'
	| 'DUPLICATE_ID'
	| 'INCOMPATIBLE_SOURCE'
	| 'INVALID_TIMELINE'
	| 'INVALID_VALUE'
	| 'LIMIT_EXCEEDED'
	| 'MISSING_REFERENCE'
	| 'TYPE_MISMATCH'
	| 'UNSUPPORTED_VERSION'

export interface ProjectValidationIssue {
	readonly code: ProjectValidationIssueCode
	readonly message: string
	readonly path: string
}

export type ProjectValidationResult =
	| { readonly ok: true; readonly project: ProjectDocument }
	| { readonly issues: readonly ProjectValidationIssue[]; readonly ok: false }

const roles = new Set(['rhythm', 'bass', 'harmony', 'melody', 'custom', 'reference'])
const modes = new Set(['major', 'minor'])
const drumInstruments = new Set(['kick', 'clap', 'closedHat', 'openHat', 'perc'])
const drumPatternCharacters = new Set(['straight', 'sparse', 'driving', 'broken', 'custom'])
const synthWaveforms = new Set(['saw', 'square', 'triangle', 'sine'])
const synthFamilies = new Set(['bass', 'lead', 'pad', 'pluck', 'texture'])
const presetFamilies: ReadonlyMap<string, string> = new Map(
	synthPresetCatalog.map((definition) => [definition.id, definition.family])
)
const drumVariantInstruments: ReadonlyMap<string, string> = new Map(
	drumVoiceVariantCatalog.map((definition) => [definition.variantId, definition.instrument])
)
const macroNames = ['brightness', 'hardness', 'dirt', 'length', 'width'] as const
const maximumIssues = 100

interface ValidationContext {
	readonly issues: ProjectValidationIssue[]
}

function issue(
	context: ValidationContext,
	code: ProjectValidationIssueCode,
	path: string,
	message: string
): void {
	if (context.issues.length < maximumIssues) context.issues.push({ code, path, message })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function scanSerializableGraph(
	value: unknown,
	context: ValidationContext,
	path: string,
	depth: number,
	seen: WeakSet<object>,
	nodeCount: { value: number }
): void {
	if (context.issues.length >= maximumIssues) return
	nodeCount.value += 1
	if (nodeCount.value > projectLimits.maxNodes) {
		issue(context, 'LIMIT_EXCEEDED', path, 'Project data contains too many values.')
		return
	}
	if (depth > projectLimits.maxDepth) {
		issue(context, 'LIMIT_EXCEEDED', path, 'Project data is nested too deeply.')
		return
	}
	if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return
	if (typeof value !== 'object') {
		issue(context, 'TYPE_MISMATCH', path, 'Project data must be JSON-compatible.')
		return
	}
	if (seen.has(value)) {
		issue(
			context,
			'CYCLE',
			path,
			'Project data must not contain cycles or shared object references.'
		)
		return
	}
	seen.add(value)
	if (Array.isArray(value)) {
		if (value.length > projectLimits.maxNotesPerClip) {
			issue(context, 'LIMIT_EXCEEDED', path, 'An array exceeds the project data limit.')
			return
		}
		for (const [index, entry] of value.entries()) {
			scanSerializableGraph(
				entry,
				context,
				`${path}[${String(index)}]`,
				depth + 1,
				seen,
				nodeCount
			)
			if (nodeCount.value > projectLimits.maxNodes) return
		}
		return
	}
	if (!isPlainRecord(value)) {
		issue(
			context,
			'TYPE_MISMATCH',
			path,
			'Project data must contain only plain objects and arrays.'
		)
		return
	}
	const entries = Object.entries(value)
	if (entries.length > projectLimits.maxObjectKeys) {
		issue(context, 'LIMIT_EXCEEDED', path, 'An object contains too many fields.')
		return
	}
	for (const [key, entry] of entries) {
		scanSerializableGraph(entry, context, `${path}.${key}`, depth + 1, seen, nodeCount)
		if (nodeCount.value > projectLimits.maxNodes) return
	}
}

function record(
	value: unknown,
	context: ValidationContext,
	path: string
): Record<string, unknown> | null {
	if (isPlainRecord(value)) return value
	issue(context, 'TYPE_MISMATCH', path, 'Expected an object.')
	return null
}

function array(
	value: unknown,
	context: ValidationContext,
	path: string,
	maximum: number
): readonly unknown[] | null {
	if (!Array.isArray(value)) {
		issue(context, 'TYPE_MISMATCH', path, 'Expected an array.')
		return null
	}
	if (value.length > maximum) {
		issue(context, 'LIMIT_EXCEEDED', path, `Expected no more than ${String(maximum)} entries.`)
		return null
	}
	return value
}

function stringValue(
	value: unknown,
	context: ValidationContext,
	path: string,
	maximum: number = projectLimits.maxTextLength,
	allowEmpty = false
): value is string {
	if (typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0)) {
		return true
	}
	issue(
		context,
		'INVALID_VALUE',
		path,
		`Expected a string of at most ${String(maximum)} characters.`
	)
	return false
}

function booleanValue(value: unknown, context: ValidationContext, path: string): value is boolean {
	if (typeof value === 'boolean') return true
	issue(context, 'TYPE_MISMATCH', path, 'Expected a boolean.')
	return false
}

function finiteNumber(
	value: unknown,
	context: ValidationContext,
	path: string,
	minimum: number,
	maximum: number
): value is number {
	if (
		typeof value === 'number' &&
		Number.isFinite(value) &&
		value >= minimum &&
		value <= maximum
	) {
		return true
	}
	issue(
		context,
		'INVALID_VALUE',
		path,
		`Expected a finite number from ${String(minimum)} to ${String(maximum)}.`
	)
	return false
}

function integer(
	value: unknown,
	context: ValidationContext,
	path: string,
	minimum: number,
	maximum: number
): value is number {
	if (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= minimum &&
		value <= maximum
	) {
		return true
	}
	issue(
		context,
		'INVALID_VALUE',
		path,
		`Expected an integer from ${String(minimum)} to ${String(maximum)}.`
	)
	return false
}

function tick(
	value: unknown,
	context: ValidationContext,
	path: string,
	positive = false
): value is number {
	return integer(value, context, path, positive ? 1 : 0, projectLimits.maxTick)
}

function opaqueIdentifier(
	value: unknown,
	context: ValidationContext,
	path: string
): value is string {
	if (isOpaqueId(value)) return true
	issue(context, 'INVALID_VALUE', path, 'Expected a bounded opaque identifier.')
	return false
}

function literal(
	value: unknown,
	expected: string | number,
	context: ValidationContext,
	path: string,
	version = false
): boolean {
	if (value === expected) return true
	issue(
		context,
		version ? 'UNSUPPORTED_VERSION' : 'INVALID_VALUE',
		path,
		`Expected ${String(expected)}.`
	)
	return false
}

function rememberIdentifier(
	value: unknown,
	seen: Set<string>,
	context: ValidationContext,
	path: string
): value is string {
	if (!opaqueIdentifier(value, context, path)) return false
	if (seen.has(value)) {
		issue(context, 'DUPLICATE_ID', path, `Duplicate identifier ${value}.`)
		return false
	}
	seen.add(value)
	return true
}

function safeEnd(start: unknown, length: unknown, context: ValidationContext, path: string): void {
	if (
		typeof start === 'number' &&
		typeof length === 'number' &&
		Number.isSafeInteger(start) &&
		Number.isSafeInteger(length) &&
		(start > projectLimits.maxTick - length || start + length > projectLimits.maxTick)
	) {
		issue(
			context,
			'INVALID_TIMELINE',
			path,
			'Timeline range overflows the supported tick range.'
		)
	}
}

function validateKey(value: unknown, context: ValidationContext, path: string): void {
	const key = record(value, context, path)
	if (key === null) return
	integer(key.tonic, context, `${path}.tonic`, 0, 11)
	if (typeof key.mode !== 'string' || !modes.has(key.mode)) {
		issue(context, 'INVALID_VALUE', `${path}.mode`, 'Expected major or minor.')
	}
}

function validateTransport(value: unknown, context: ValidationContext): void {
	const transport = record(value, context, '$.transport')
	if (transport === null) return
	literal(
		transport.ticksPerQuarter,
		defaultTicksPerQuarter,
		context,
		'$.transport.ticksPerQuarter'
	)
	validateKey(transport.key, context, '$.transport.key')

	const tempoMap = array(
		transport.tempoMap,
		context,
		'$.transport.tempoMap',
		projectLimits.maxSections
	)
	if (tempoMap !== null) {
		let previous = -1
		if (tempoMap.length === 0)
			issue(
				context,
				'INVALID_TIMELINE',
				'$.transport.tempoMap',
				'Tempo map must not be empty.'
			)
		for (const [index, entry] of tempoMap.entries()) {
			const path = `$.transport.tempoMap[${String(index)}]`
			const point = record(entry, context, path)
			if (point === null) continue
			finiteNumber(point.bpm, context, `${path}.bpm`, 20, 400)
			if (tick(point.tick, context, `${path}.tick`)) {
				if (index === 0 && point.tick !== 0)
					issue(
						context,
						'INVALID_TIMELINE',
						`${path}.tick`,
						'Tempo map must begin at tick zero.'
					)
				if (point.tick <= previous)
					issue(
						context,
						'INVALID_TIMELINE',
						`${path}.tick`,
						'Tempo points must be strictly ordered.'
					)
				previous = point.tick
			}
		}
	}

	const meterMap = array(
		transport.meterMap,
		context,
		'$.transport.meterMap',
		projectLimits.maxSections
	)
	if (meterMap !== null) {
		let previous = -1
		if (meterMap.length === 0)
			issue(
				context,
				'INVALID_TIMELINE',
				'$.transport.meterMap',
				'Meter map must not be empty.'
			)
		for (const [index, entry] of meterMap.entries()) {
			const path = `$.transport.meterMap[${String(index)}]`
			const point = record(entry, context, path)
			if (point === null) continue
			integer(point.numerator, context, `${path}.numerator`, 1, 32)
			if (![1, 2, 4, 8, 16].includes(point.denominator as number)) {
				issue(
					context,
					'INVALID_VALUE',
					`${path}.denominator`,
					'Expected a power-of-two meter denominator from 1 to 16.'
				)
			}
			if (tick(point.tick, context, `${path}.tick`)) {
				if (index === 0 && point.tick !== 0)
					issue(
						context,
						'INVALID_TIMELINE',
						`${path}.tick`,
						'Meter map must begin at tick zero.'
					)
				if (point.tick <= previous)
					issue(
						context,
						'INVALID_TIMELINE',
						`${path}.tick`,
						'Meter points must be strictly ordered.'
					)
				previous = point.tick
			}
		}
	}

	const loop = record(transport.loop, context, '$.transport.loop')
	if (loop !== null) {
		booleanValue(loop.enabled, context, '$.transport.loop.enabled')
		const startTick = loop.startTick
		const endTick = loop.endTick
		const validStart = tick(startTick, context, '$.transport.loop.startTick')
		const validEnd = tick(endTick, context, '$.transport.loop.endTick', true)
		if (validStart && validEnd && endTick <= startTick) {
			issue(
				context,
				'INVALID_TIMELINE',
				'$.transport.loop.endTick',
				'Loop end must be after loop start.'
			)
		}
	}
}

function validateResolvedPatch(value: unknown, context: ValidationContext, path: string): void {
	const patch = record(value, context, path)
	if (patch === null) return
	literal(patch.patchModelVersion, patchModelVersion, context, `${path}.patchModelVersion`, true)
	literal(patch.voice, 'subtractive-synth', context, `${path}.voice`)
	const oscillator = record(patch.oscillator, context, `${path}.oscillator`)
	if (oscillator !== null) {
		if (typeof oscillator.waveform !== 'string' || !synthWaveforms.has(oscillator.waveform)) {
			issue(
				context,
				'INVALID_VALUE',
				`${path}.oscillator.waveform`,
				'Expected a supported oscillator waveform.'
			)
		}
		finiteNumber(oscillator.detuneCents, context, `${path}.oscillator.detuneCents`, -100, 100)
		finiteNumber(oscillator.subLevel, context, `${path}.oscillator.subLevel`, 0, 1)
		finiteNumber(oscillator.noiseLevel, context, `${path}.oscillator.noiseLevel`, 0, 1)
		finiteNumber(oscillator.pulseWidth, context, `${path}.oscillator.pulseWidth`, 0.05, 0.95)
	}
	const movement = record(patch.movement, context, `${path}.movement`)
	if (movement !== null) {
		finiteNumber(movement.rateHz, context, `${path}.movement.rateHz`, 0, 20)
		finiteNumber(movement.depth, context, `${path}.movement.depth`, 0, 1)
	}
	const filter = record(patch.filter, context, `${path}.filter`)
	if (filter !== null) {
		finiteNumber(filter.cutoffHz, context, `${path}.filter.cutoffHz`, 20, 24_000)
		finiteNumber(filter.resonance, context, `${path}.filter.resonance`, 0, 1)
		finiteNumber(filter.envelopeAmount, context, `${path}.filter.envelopeAmount`, -1, 1)
	}
	const amplifier = record(patch.amplifier, context, `${path}.amplifier`)
	if (amplifier !== null) {
		finiteNumber(amplifier.attackMs, context, `${path}.amplifier.attackMs`, 0, 60_000)
		finiteNumber(amplifier.decayMs, context, `${path}.amplifier.decayMs`, 0, 60_000)
		finiteNumber(amplifier.sustain, context, `${path}.amplifier.sustain`, 0, 1)
		finiteNumber(amplifier.releaseMs, context, `${path}.amplifier.releaseMs`, 0, 60_000)
	}
	finiteNumber(patch.drive, context, `${path}.drive`, 0, 1)
	finiteNumber(patch.stereoWidth, context, `${path}.stereoWidth`, 0, 1)
	finiteNumber(patch.outputGain, context, `${path}.outputGain`, 0, 2)
}

function validateSynthSource(value: unknown, context: ValidationContext, path: string): void {
	const source = record(value, context, path)
	if (source === null) return
	literal(source.type, 'synth', context, `${path}.type`)
	const performance = record(source.performance, context, `${path}.performance`)
	if (performance !== null) {
		validateKey(performance.key, context, `${path}.performance.key`)
		integer(performance.octave, context, `${path}.performance.octave`, 1, 6)
	}
	const instrument = record(source.instrument, context, `${path}.instrument`)
	if (instrument === null) return
	const family =
		typeof instrument.family === 'string' && synthFamilies.has(instrument.family)
			? instrument.family
			: null
	if (family === null) {
		issue(
			context,
			'INVALID_VALUE',
			`${path}.instrument.family`,
			'Expected a supported synth family.'
		)
	}
	const presetFamily =
		typeof instrument.presetId === 'string'
			? presetFamilies.get(instrument.presetId)
			: undefined
	if (presetFamily === undefined) {
		issue(
			context,
			'INVALID_VALUE',
			`${path}.instrument.presetId`,
			'Expected a supported synth preset.'
		)
	} else if (family !== null && presetFamily !== family) {
		issue(
			context,
			'INCOMPATIBLE_SOURCE',
			`${path}.instrument.presetId`,
			'The synth preset does not belong to its family.'
		)
	}
	integer(
		instrument.presetRevision,
		context,
		`${path}.instrument.presetRevision`,
		1,
		Number.MAX_SAFE_INTEGER
	)
	literal(
		instrument.macroMappingVersion,
		macroMappingVersion,
		context,
		`${path}.instrument.macroMappingVersion`,
		true
	)
	const macros = record(instrument.macros, context, `${path}.instrument.macros`)
	if (macros !== null) {
		for (const name of macroNames)
			finiteNumber(macros[name], context, `${path}.instrument.macros.${name}`, 0, 1)
	}
	validateResolvedPatch(instrument.resolvedPatch, context, `${path}.instrument.resolvedPatch`)
	if (presetFamily !== undefined && macros !== null) {
		try {
			const expected = createSynthInstrument(
				instrument.presetId as Parameters<typeof createSynthInstrument>[0],
				macros as unknown as Parameters<typeof createSynthInstrument>[1]
			)
			if (
				JSON.stringify(expected.resolvedPatch) !== JSON.stringify(instrument.resolvedPatch)
			) {
				issue(
					context,
					'INVALID_VALUE',
					`${path}.instrument.resolvedPatch`,
					'The resolved synth patch does not match its preset and macros.'
				)
			}
		} catch {
			// Field-level issues already describe malformed macros.
		}
	}
}

function validateDrumSource(
	value: Record<string, unknown>,
	context: ValidationContext,
	path: string
): void {
	literal(value.kitId, 'drums.clean-pulse', context, `${path}.kitId`)
	literal(value.kitRevision, 1, context, `${path}.kitRevision`)
	const variants = record(value.voiceVariants, context, `${path}.voiceVariants`)
	if (variants !== null) {
		for (const instrument of drumInstruments) {
			const variant = variants[instrument]
			if (typeof variant !== 'string' || drumVariantInstruments.get(variant) !== instrument) {
				issue(
					context,
					'INVALID_VALUE',
					`${path}.voiceVariants.${instrument}`,
					`Expected a ${instrument} voice variant.`
				)
			}
		}
	}
	const patch = record(value.resolvedPatch, context, `${path}.resolvedPatch`)
	if (patch !== null) {
		literal(
			patch.patchModelVersion,
			patchModelVersion,
			context,
			`${path}.resolvedPatch.patchModelVersion`,
			true
		)
		const voices = record(patch.voices, context, `${path}.resolvedPatch.voices`)
		if (voices !== null) {
			for (const instrument of drumInstruments) {
				const voicePath = `${path}.resolvedPatch.voices.${instrument}`
				const voice = record(voices[instrument], context, voicePath)
				if (voice === null) continue
				const expectedAlgorithm =
					instrument === 'closedHat'
						? 'closed-hat'
						: instrument === 'openHat'
							? 'open-hat'
							: instrument
				literal(voice.algorithm, expectedAlgorithm, context, `${voicePath}.algorithm`)
				finiteNumber(voice.pitchHz, context, `${voicePath}.pitchHz`, 20, 20_000)
				finiteNumber(voice.tone, context, `${voicePath}.tone`, 0, 1)
				finiteNumber(voice.decayMs, context, `${voicePath}.decayMs`, 1, 10_000)
				finiteNumber(voice.noise, context, `${voicePath}.noise`, 0, 1)
				finiteNumber(voice.drive, context, `${voicePath}.drive`, 0, 1)
				finiteNumber(voice.gain, context, `${voicePath}.gain`, 0, 2)
				if (
					typeof voice.variantId !== 'string' ||
					drumVariantInstruments.get(voice.variantId) !== instrument
				) {
					issue(
						context,
						'INVALID_VALUE',
						`${voicePath}.variantId`,
						`Expected a ${instrument} voice variant.`
					)
				}
			}
		}
	}
	if (variants !== null) {
		try {
			const expected = createCleanPulseDrumSource(
				variants as unknown as Parameters<typeof createCleanPulseDrumSource>[0]
			)
			if (JSON.stringify(expected.resolvedPatch) !== JSON.stringify(value.resolvedPatch)) {
				issue(
					context,
					'INVALID_VALUE',
					`${path}.resolvedPatch`,
					'The resolved drum patch does not match its selected variants.'
				)
			}
		} catch {
			// Field-level issues already describe malformed variants.
		}
	}
}

interface ProjectReferences {
	readonly assets: Set<string>
	readonly sections: Set<string>
}

interface ProjectIdentifiers {
	readonly assets: Set<string>
	readonly clips: Set<string>
	readonly drumEvents: Set<string>
	readonly layers: Set<string>
	readonly notes: Set<string>
	readonly sections: Set<string>
}

function validateMidiClip(
	clip: Record<string, unknown>,
	context: ValidationContext,
	path: string,
	identifiers: ProjectIdentifiers
): void {
	const notes = array(clip.notes, context, `${path}.notes`, projectLimits.maxNotesPerClip)
	if (notes === null) return
	for (const [index, entry] of notes.entries()) {
		const notePath = `${path}.notes[${String(index)}]`
		const note = record(entry, context, notePath)
		if (note === null) continue
		rememberIdentifier(note.id, identifiers.notes, context, `${notePath}.id`)
		integer(note.pitch, context, `${notePath}.pitch`, 0, 127)
		integer(note.velocity, context, `${notePath}.velocity`, 1, 127)
		const startTick = note.startTick
		const durationTicks = note.durationTicks
		const validStart = tick(startTick, context, `${notePath}.startTick`)
		const validDuration = tick(durationTicks, context, `${notePath}.durationTicks`, true)
		safeEnd(startTick, durationTicks, context, notePath)
		if (
			validStart &&
			validDuration &&
			typeof clip.lengthTicks === 'number' &&
			startTick + durationTicks > clip.lengthTicks
		) {
			issue(context, 'INVALID_TIMELINE', notePath, 'A MIDI note must fit inside its clip.')
		}
	}
}

function validateDrumClip(
	clip: Record<string, unknown>,
	context: ValidationContext,
	path: string,
	identifiers: ProjectIdentifiers
): void {
	if (typeof clip.character !== 'string' || !drumPatternCharacters.has(clip.character)) {
		issue(
			context,
			'INVALID_VALUE',
			`${path}.character`,
			'Expected a supported drum pattern character.'
		)
	}
	finiteNumber(clip.density, context, `${path}.density`, 0, 1)
	finiteNumber(clip.swing, context, `${path}.swing`, 0, 1)
	const pattern = record(clip.pattern, context, `${path}.pattern`)
	let stepCount: number | null = null
	let stepsPerQuarter: number | null = null
	if (pattern !== null) {
		if (integer(pattern.stepCount, context, `${path}.pattern.stepCount`, 1, 1024))
			stepCount = pattern.stepCount
		if (![1, 2, 4, 8].includes(pattern.stepsPerQuarter as number)) {
			issue(
				context,
				'INVALID_VALUE',
				`${path}.pattern.stepsPerQuarter`,
				'Expected 1, 2, 4 or 8 steps per quarter.'
			)
		} else stepsPerQuarter = pattern.stepsPerQuarter as number
	}
	const events = array(clip.events, context, `${path}.events`, projectLimits.maxDrumEventsPerClip)
	if (events === null) return
	for (const [index, entry] of events.entries()) {
		const eventPath = `${path}.events[${String(index)}]`
		const event = record(entry, context, eventPath)
		if (event === null) continue
		rememberIdentifier(event.id, identifiers.drumEvents, context, `${eventPath}.id`)
		if (typeof event.instrument !== 'string' || !drumInstruments.has(event.instrument)) {
			issue(
				context,
				'INVALID_VALUE',
				`${eventPath}.instrument`,
				'Expected a supported drum instrument.'
			)
		}
		integer(event.velocity, context, `${eventPath}.velocity`, 1, 127)
		const eventStep = event.step
		const validStep = integer(
			eventStep,
			context,
			`${eventPath}.step`,
			0,
			stepCount === null ? 1023 : stepCount - 1
		)
		if (
			validStep &&
			stepsPerQuarter !== null &&
			typeof clip.lengthTicks === 'number' &&
			eventStep * (defaultTicksPerQuarter / stepsPerQuarter) >= clip.lengthTicks
		) {
			issue(
				context,
				'INVALID_TIMELINE',
				`${eventPath}.step`,
				'A drum event must fit inside its clip.'
			)
		}
	}
}

function validateClip(
	value: unknown,
	context: ValidationContext,
	path: string,
	identifiers: ProjectIdentifiers,
	references: ProjectReferences,
	expectedKind: 'drum' | 'midi'
): void {
	const clip = record(value, context, path)
	if (clip === null) return
	rememberIdentifier(clip.id, identifiers.clips, context, `${path}.id`)
	const validStart = tick(clip.startTick, context, `${path}.startTick`)
	const validLength = tick(clip.lengthTicks, context, `${path}.lengthTicks`, true)
	if (validStart && validLength) safeEnd(clip.startTick, clip.lengthTicks, context, path)
	booleanValue(clip.loop, context, `${path}.loop`)
	if (clip.sectionId !== null) {
		if (
			opaqueIdentifier(clip.sectionId, context, `${path}.sectionId`) &&
			!references.sections.has(clip.sectionId)
		) {
			issue(
				context,
				'MISSING_REFERENCE',
				`${path}.sectionId`,
				`Unknown section ${clip.sectionId}.`
			)
		}
	}
	if (clip.kind !== expectedKind) {
		issue(
			context,
			'INCOMPATIBLE_SOURCE',
			`${path}.kind`,
			`Expected a ${expectedKind} clip for this layer source.`
		)
	}
	if (clip.kind === 'midi') validateMidiClip(clip, context, path, identifiers)
	else if (clip.kind === 'drum') validateDrumClip(clip, context, path, identifiers)
	else issue(context, 'INVALID_VALUE', `${path}.kind`, 'Expected a MIDI or drum clip.')
}

function validateSections(
	value: unknown,
	context: ValidationContext,
	identifiers: ProjectIdentifiers
): Map<string, string | null> {
	const parents = new Map<string, string | null>()
	const sections = array(value, context, '$.sections', projectLimits.maxSections)
	if (sections === null) return parents
	for (const [index, entry] of sections.entries()) {
		const path = `$.sections[${String(index)}]`
		const section = record(entry, context, path)
		if (section === null) continue
		const id = section.id
		const hasId = rememberIdentifier(id, identifiers.sections, context, `${path}.id`)
		stringValue(section.name, context, `${path}.name`, projectLimits.maxNameLength)
		const validStart = tick(section.startTick, context, `${path}.startTick`)
		const validLength = tick(section.lengthTicks, context, `${path}.lengthTicks`, true)
		if (validStart && validLength)
			safeEnd(section.startTick, section.lengthTicks, context, path)
		let parent: string | null = null
		if (section.parentSectionId !== null) {
			if (opaqueIdentifier(section.parentSectionId, context, `${path}.parentSectionId`))
				parent = section.parentSectionId
		}
		if (hasId) parents.set(id, parent)
	}
	for (const [id, parent] of parents) {
		if (parent !== null && !parents.has(parent)) {
			issue(
				context,
				'MISSING_REFERENCE',
				'$.sections',
				`Section ${id} refers to unknown parent ${parent}.`
			)
		}
	}
	for (const id of parents.keys()) {
		const visited = new Set<string>()
		let current: string | null | undefined = id
		while (current !== null && current !== undefined) {
			if (visited.has(current)) {
				issue(context, 'CYCLE', '$.sections', `Section parent cycle contains ${current}.`)
				break
			}
			visited.add(current)
			current = parents.get(current)
		}
	}
	return parents
}

function validateAssets(
	value: unknown,
	context: ValidationContext,
	identifiers: ProjectIdentifiers
): void {
	const assets = array(value, context, '$.assets', projectLimits.maxAssets)
	if (assets === null) return
	for (const [index, entry] of assets.entries()) {
		const path = `$.assets[${String(index)}]`
		const asset = record(entry, context, path)
		if (asset === null) continue
		rememberIdentifier(asset.id, identifiers.assets, context, `${path}.id`)
		stringValue(asset.contentHash, context, `${path}.contentHash`)
		stringValue(asset.mediaType, context, `${path}.mediaType`)
		integer(asset.byteLength, context, `${path}.byteLength`, 0, Number.MAX_SAFE_INTEGER)
	}
}

function validateLayers(
	value: unknown,
	context: ValidationContext,
	identifiers: ProjectIdentifiers,
	references: ProjectReferences
): void {
	const layers = array(value, context, '$.layers', projectLimits.maxLayers)
	if (layers === null) return
	for (const [layerIndex, entry] of layers.entries()) {
		const path = `$.layers[${String(layerIndex)}]`
		const layer = record(entry, context, path)
		if (layer === null) continue
		rememberIdentifier(layer.id, identifiers.layers, context, `${path}.id`)
		stringValue(layer.name, context, `${path}.name`, projectLimits.maxNameLength)
		finiteNumber(layer.gain, context, `${path}.gain`, 0, 2)
		finiteNumber(layer.pan, context, `${path}.pan`, -1, 1)
		booleanValue(layer.muted, context, `${path}.muted`)
		booleanValue(layer.solo, context, `${path}.solo`)
		const exportIncluded = booleanValue(layer.exportIncluded, context, `${path}.exportIncluded`)
		const role = typeof layer.role === 'string' && roles.has(layer.role) ? layer.role : null
		if (role === null)
			issue(context, 'INVALID_VALUE', `${path}.role`, 'Expected a supported musical role.')

		const source = record(layer.source, context, `${path}.source`)
		let expectedKind: 'drum' | 'midi' = 'midi'
		if (source !== null && role !== null) {
			if (role === 'rhythm') {
				expectedKind = 'drum'
				if (source.type !== 'drum')
					issue(
						context,
						'INCOMPATIBLE_SOURCE',
						`${path}.source`,
						'Rhythm layers require a drum source.'
					)
				else {
					validateDrumSource(source, context, `${path}.source`)
				}
			} else if (role === 'reference') {
				if (source.type !== 'reference')
					issue(
						context,
						'INCOMPATIBLE_SOURCE',
						`${path}.source`,
						'Reference layers require a reference source.'
					)
				else if (
					opaqueIdentifier(source.assetId, context, `${path}.source.assetId`) &&
					!references.assets.has(source.assetId)
				) {
					issue(
						context,
						'MISSING_REFERENCE',
						`${path}.source.assetId`,
						`Unknown asset ${source.assetId}.`
					)
				}
				if (exportIncluded && layer.exportIncluded)
					issue(
						context,
						'INCOMPATIBLE_SOURCE',
						`${path}.exportIncluded`,
						'Reference layers must be excluded from export.'
					)
			} else if (source.type !== 'synth') {
				issue(
					context,
					'INCOMPATIBLE_SOURCE',
					`${path}.source`,
					'Tonal layers require a synth source.'
				)
			} else {
				validateSynthSource(source, context, `${path}.source`)
			}
		}

		const clips = array(layer.clips, context, `${path}.clips`, projectLimits.maxClipsPerLayer)
		if (clips !== null) {
			if (role === 'reference' && clips.length > 0)
				issue(
					context,
					'INCOMPATIBLE_SOURCE',
					`${path}.clips`,
					'Reference layers cannot contain generated clips.'
				)
			for (const [clipIndex, clip] of clips.entries()) {
				validateClip(
					clip,
					context,
					`${path}.clips[${String(clipIndex)}]`,
					identifiers,
					references,
					expectedKind
				)
			}
		}
	}
}

export function validateProjectDocument(value: unknown): ProjectValidationResult {
	const context: ValidationContext = { issues: [] }
	try {
		scanSerializableGraph(value, context, '$', 0, new WeakSet(), { value: 0 })
		if (context.issues.length > 0) return { ok: false, issues: Object.freeze(context.issues) }
		const project = record(value, context, '$')
		if (project === null) return { ok: false, issues: Object.freeze(context.issues) }
		literal(project.schemaVersion, projectSchemaVersion, context, '$.schemaVersion', true)
		literal(
			project.engineModelVersion,
			engineModelVersion,
			context,
			'$.engineModelVersion',
			true
		)
		opaqueIdentifier(project.projectId, context, '$.projectId')
		stringValue(project.title, context, '$.title', projectLimits.maxNameLength)
		validateTransport(project.transport, context)
		const identifiers: ProjectIdentifiers = {
			assets: new Set(),
			clips: new Set(),
			drumEvents: new Set(),
			layers: new Set(),
			notes: new Set(),
			sections: new Set()
		}
		validateAssets(project.assets, context, identifiers)
		validateSections(project.sections, context, identifiers)
		validateLayers(project.layers, context, identifiers, {
			assets: identifiers.assets,
			sections: identifiers.sections
		})
		if (context.issues.length > 0) return { ok: false, issues: Object.freeze(context.issues) }
		return { ok: true, project: cloneAndFreeze(project as unknown as ProjectDocument) }
	} catch (error) {
		issue(
			context,
			'TYPE_MISMATCH',
			'$',
			`Project data could not be inspected: ${error instanceof Error ? error.message : 'unknown error'}`
		)
		return { ok: false, issues: Object.freeze(context.issues) }
	}
}

export class ProjectValidationError extends Error {
	public readonly issues: readonly ProjectValidationIssue[]

	public constructor(issues: readonly ProjectValidationIssue[]) {
		super(`Project validation failed with ${String(issues.length)} issue(s).`)
		this.name = 'ProjectValidationError'
		this.issues = issues
	}
}

export function assertValidProject(value: unknown): ProjectDocument {
	const result = validateProjectDocument(value)
	if (!result.ok) throw new ProjectValidationError(result.issues)
	return result.project
}
