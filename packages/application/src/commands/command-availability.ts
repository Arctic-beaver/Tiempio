import type { LocalizationKey } from '../../../localization/src/index.js'
import type { StudioDrawer } from '../app/studio-state.js'
import {
	commandDefinition,
	commandIds,
	type CommandEffectOwner,
	type CommandId
} from './command-registry.js'

export interface CommandAvailabilityContext {
	readonly activeDrawer: StudioDrawer
	readonly engineAvailable: boolean
	readonly projectRevision: number | null
}

export type ResolvedCommandState = Readonly<
	{ readonly effectOwner: CommandEffectOwner } & (
		| { readonly available: true; readonly disabledReasonKey: null }
		| { readonly available: false; readonly disabledReasonKey: LocalizationKey }
	)
>

export type CommandHandlerMap = Readonly<Partial<Record<CommandId, () => void>>>
export type ResolvedCommandStates = Readonly<Record<CommandId, ResolvedCommandState>>

function availabilityFailure(
	commandId: CommandId,
	context: CommandAvailabilityContext
): LocalizationKey | null {
	const definition = commandDefinition(commandId)
	if (definition.availability === 'engine' && !context.engineAvailable) {
		return definition.disabledReasonKey
	}
	if (definition.availability === 'project' && context.projectRevision === null) {
		return definition.disabledReasonKey
	}
	if (definition.availability === 'drawer-open' && context.activeDrawer === null) {
		return definition.disabledReasonKey
	}
	return null
}

export function resolveCommandState(
	commandId: CommandId,
	context: CommandAvailabilityContext,
	handlerAvailable: boolean
): ResolvedCommandState {
	const definition = commandDefinition(commandId)
	const requirementFailure = availabilityFailure(commandId, context)
	const disabledReasonKey =
		requirementFailure ?? (handlerAvailable ? null : 'command.disabled.unavailable')
	return disabledReasonKey === null
		? Object.freeze({
				available: true as const,
				disabledReasonKey: null,
				effectOwner: definition.effectOwner
			})
		: Object.freeze({
				available: false as const,
				disabledReasonKey,
				effectOwner: definition.effectOwner
			})
}

export function resolveCommandStates(
	context: CommandAvailabilityContext,
	handlers: CommandHandlerMap
): ResolvedCommandStates {
	return Object.freeze(
		Object.fromEntries(
			commandIds.map((commandId) => [
				commandId,
				resolveCommandState(commandId, context, handlers[commandId] !== undefined)
			])
		) as Record<CommandId, ResolvedCommandState>
	)
}

export function executeResolvedCommand(
	commandId: CommandId,
	states: ResolvedCommandStates,
	handlers: CommandHandlerMap
): boolean {
	if (!states[commandId].available) return false
	const handler = handlers[commandId]
	if (handler === undefined) return false
	handler()
	return true
}
