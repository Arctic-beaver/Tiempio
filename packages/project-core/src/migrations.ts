import {
	defaultTicksPerQuarter,
	engineModelVersion,
	legacyProjectSchemaVersion,
	macroMappingVersion,
	patchModelVersion,
	projectSchemaVersion,
	projectTick,
	type ProjectDocument
} from './model.js'
import { validateProjectDocument, type ProjectValidationIssue } from './validation.js'

export type ProjectLoadResult =
	| {
			readonly migratedFromSchemaVersion: number | null
			readonly project: ProjectDocument
			readonly status: 'loaded'
	  }
	| {
			readonly issues: readonly ProjectValidationIssue[]
			readonly status: 'invalid'
	  }
	| {
			readonly engineVersion: number | null
			readonly macroVersion: number | null
			readonly patchVersion: number | null
			readonly reason: string
			readonly schemaVersion: number
			readonly status: 'unsupported'
	  }

function plainRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
		? (value as Record<string, unknown>)
		: null
}

function highestFutureModelVersion(value: Record<string, unknown>): {
	engineVersion: number | null
	macroVersion: number | null
	patchVersion: number | null
} {
	let discoveredPatch: number | null = null
	let discoveredMacro: number | null = null
	const engineVersion =
		typeof value.engineModelVersion === 'number' &&
		value.engineModelVersion > engineModelVersion
			? value.engineModelVersion
			: null
	const layers = Array.isArray(value.layers) ? value.layers.slice(0, 129) : []
	for (const layerValue of layers) {
		const layer = plainRecord(layerValue)
		const source = layer === null ? null : plainRecord(layer.source)
		if (source === null) continue
		if (
			typeof source.patchModelVersion === 'number' &&
			source.patchModelVersion > patchModelVersion
		) {
			discoveredPatch = Math.max(discoveredPatch ?? 0, source.patchModelVersion)
		}
		const instrument = plainRecord(source.instrument)
		if (instrument === null) continue
		if (
			typeof instrument.macroMappingVersion === 'number' &&
			instrument.macroMappingVersion > macroMappingVersion
		) {
			discoveredMacro = Math.max(discoveredMacro ?? 0, instrument.macroMappingVersion)
		}
		const resolvedPatch = plainRecord(instrument.resolvedPatch)
		if (
			resolvedPatch !== null &&
			typeof resolvedPatch.patchModelVersion === 'number' &&
			resolvedPatch.patchModelVersion > patchModelVersion
		) {
			discoveredPatch = Math.max(discoveredPatch ?? 0, resolvedPatch.patchModelVersion)
		}
	}
	return {
		engineVersion,
		macroVersion: discoveredMacro,
		patchVersion: discoveredPatch
	}
}

function unsupported(
	schemaVersion: number,
	models: ReturnType<typeof highestFutureModelVersion>,
	reason: string
): ProjectLoadResult {
	return {
		status: 'unsupported',
		schemaVersion,
		engineVersion: models.engineVersion,
		macroVersion: models.macroVersion,
		patchVersion: models.patchVersion,
		reason
	}
}

function loadCurrent(value: Record<string, unknown>): ProjectLoadResult {
	const futureModels = highestFutureModelVersion(value)
	if (
		futureModels.engineVersion !== null ||
		futureModels.macroVersion !== null ||
		futureModels.patchVersion !== null
	) {
		return unsupported(
			projectSchemaVersion,
			futureModels,
			'The project uses a newer engine, macro mapping or resolved patch model.'
		)
	}
	const result = validateProjectDocument(value)
	return result.ok
		? { status: 'loaded', project: result.project, migratedFromSchemaVersion: null }
		: { status: 'invalid', issues: result.issues }
}

function migrateLegacy(value: Record<string, unknown>): ProjectLoadResult {
	const migrated = {
		schemaVersion: projectSchemaVersion,
		engineModelVersion,
		projectId: value.projectId,
		title: value.title,
		transport: {
			ticksPerQuarter: defaultTicksPerQuarter,
			tempoMap: [{ tick: projectTick(0), bpm: value.tempo }],
			meterMap: [{ tick: projectTick(0), numerator: 4, denominator: 4 }],
			key: value.key,
			loop: {
				enabled: true,
				startTick: projectTick(0),
				endTick: projectTick(defaultTicksPerQuarter * 16)
			}
		},
		sections: [],
		layers: value.layers ?? [],
		assets: []
	}
	const futureModels = highestFutureModelVersion(migrated)
	if (
		futureModels.engineVersion !== null ||
		futureModels.macroVersion !== null ||
		futureModels.patchVersion !== null
	) {
		return unsupported(
			legacyProjectSchemaVersion,
			futureModels,
			'The legacy project contains a newer patch or macro model.'
		)
	}
	const result = validateProjectDocument(migrated)
	return result.ok
		? {
				status: 'loaded',
				project: result.project,
				migratedFromSchemaVersion: legacyProjectSchemaVersion
			}
		: { status: 'invalid', issues: result.issues }
}

export function loadProjectDocument(value: unknown): ProjectLoadResult {
	try {
		const candidate = plainRecord(value)
		if (candidate === null) {
			return {
				status: 'invalid',
				issues: Object.freeze([
					{
						code: 'TYPE_MISMATCH',
						path: '$',
						message: 'Expected a project object.'
					}
				])
			}
		}
		const schemaVersion = candidate.schemaVersion
		if (
			typeof schemaVersion !== 'number' ||
			!Number.isSafeInteger(schemaVersion) ||
			schemaVersion < 0
		) {
			return {
				status: 'invalid',
				issues: Object.freeze([
					{
						code: 'INVALID_VALUE',
						path: '$.schemaVersion',
						message: 'Expected a non-negative integer schema version.'
					}
				])
			}
		}
		if (schemaVersion > projectSchemaVersion) {
			return unsupported(
				schemaVersion,
				highestFutureModelVersion(candidate),
				'The project schema is newer than this application supports.'
			)
		}
		if (schemaVersion === projectSchemaVersion) return loadCurrent(candidate)
		if (schemaVersion === legacyProjectSchemaVersion) return migrateLegacy(candidate)
		return unsupported(
			schemaVersion,
			highestFutureModelVersion(candidate),
			'No migration is available for this project schema.'
		)
	} catch (error) {
		return {
			status: 'invalid',
			issues: Object.freeze([
				{
					code: 'TYPE_MISMATCH',
					path: '$',
					message: `Project data could not be inspected: ${error instanceof Error ? error.message : 'unknown error'}`
				}
			])
		}
	}
}
