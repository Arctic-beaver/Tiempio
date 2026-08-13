import {
	applicationCommonCapabilityCodes,
	audibleOutputCapabilityCodes,
	engineCapabilityCodes,
	type EngineCapabilityCode
} from './generated/engine-protocol.generated.js'

export interface EngineCapabilityProfile {
	readonly required: readonly EngineCapabilityCode[]
	readonly audibleOutput: readonly EngineCapabilityCode[]
	readonly optional: readonly EngineCapabilityCode[]
}

export interface EngineCapabilityEvaluation {
	readonly compatible: boolean
	readonly missingRequired: readonly EngineCapabilityCode[]
	readonly negotiatedOutput: EngineCapabilityCode | null
}

const optionalApplicationCapabilities = Object.freeze<readonly EngineCapabilityCode[]>([
	'audio.devices',
	'render.offline',
	'supervision.heartbeat'
])

export const applicationEngineCapabilityProfile = Object.freeze({
	required: applicationCommonCapabilityCodes,
	audibleOutput: audibleOutputCapabilityCodes,
	optional: optionalApplicationCapabilities
}) satisfies EngineCapabilityProfile

export const applicationEngineRequestedCapabilityCodes = Object.freeze(
	engineCapabilityCodes.filter((capability) => {
		const required = new Set<EngineCapabilityCode>(applicationEngineCapabilityProfile.required)
		const outputs = new Set<EngineCapabilityCode>(
			applicationEngineCapabilityProfile.audibleOutput
		)
		const optional = new Set<EngineCapabilityCode>(applicationEngineCapabilityProfile.optional)
		return required.has(capability) || outputs.has(capability) || optional.has(capability)
	})
)

export function evaluateEngineCapabilities(
	available: readonly EngineCapabilityCode[],
	profile: EngineCapabilityProfile = applicationEngineCapabilityProfile
): EngineCapabilityEvaluation {
	const capabilities = new Set(available)
	const missingRequired = profile.required.filter((capability) => !capabilities.has(capability))
	const negotiatedOutputs = profile.audibleOutput.filter((capability) =>
		capabilities.has(capability)
	)
	return Object.freeze({
		compatible: missingRequired.length === 0 && negotiatedOutputs.length === 1,
		missingRequired: Object.freeze(missingRequired),
		negotiatedOutput: negotiatedOutputs.length === 1 ? negotiatedOutputs[0] : null
	})
}
