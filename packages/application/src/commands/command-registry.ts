import type { LocalizationKey } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'

export const commandIds = Object.freeze([
	'studio.home',
	'studio.first-layer',
	'studio.sound-chooser',
	'studio.piano-roll',
	'studio.drums',
	'studio.arrangement',
	'studio.sound-sculpt',
	'transport.toggle-playback',
	'transport.toggle-loop',
	'transport.stop',
	'layout.open-navigation',
	'layout.open-context',
	'layout.close-drawer'
] as const)

export type CommandId = (typeof commandIds)[number]
export type CommandPlacement = 'activity' | 'layer' | 'transport' | 'window' | 'workflow'
export type CommandEffectOwner = 'engine' | 'presentation' | 'project'
export type CommandAvailabilityRequirement = 'always' | 'drawer-open' | 'engine' | 'project'

export interface CommandShortcut {
	readonly key: string
	readonly primary?: boolean
	readonly shift?: boolean
}

export interface CommandDefinition {
	readonly availability: CommandAvailabilityRequirement
	readonly disabledReasonKey: LocalizationKey
	readonly effectOwner: CommandEffectOwner
	readonly id: CommandId
	readonly labelKey: LocalizationKey
	readonly placements: readonly CommandPlacement[]
	readonly shortcut?: CommandShortcut
	readonly view?: StudioViewId
}

function defineCommand(definition: CommandDefinition): Readonly<CommandDefinition> {
	return Object.freeze(definition)
}

export const commandDefinitions: readonly CommandDefinition[] = Object.freeze([
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.home',
		labelKey: 'nav.home',
		placements: ['activity'],
		shortcut: { key: '1', primary: true },
		view: 'home'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.first-layer',
		labelKey: 'layers.add',
		placements: ['workflow'],
		view: 'first-layer'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.sound-chooser',
		labelKey: 'soundChooser.title',
		placements: ['workflow'],
		view: 'sound-chooser'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.piano-roll',
		labelKey: 'nav.piano',
		placements: ['activity', 'layer'],
		shortcut: { key: '2', primary: true },
		view: 'piano-roll'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.drums',
		labelKey: 'nav.drums',
		placements: ['activity', 'layer'],
		shortcut: { key: '3', primary: true },
		view: 'drums'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.arrangement',
		labelKey: 'nav.arrangement',
		placements: ['activity'],
		shortcut: { key: '4', primary: true },
		view: 'arrangement'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.sound-sculpt',
		labelKey: 'nav.soundSculpt',
		placements: ['activity'],
		shortcut: { key: '5', primary: true },
		view: 'sound-sculpt'
	}),
	defineCommand({
		availability: 'engine',
		disabledReasonKey: 'command.disabled.engineUnavailable',
		effectOwner: 'engine',
		id: 'transport.toggle-playback',
		labelKey: 'transport.play',
		placements: ['transport'],
		shortcut: { key: ' ' }
	}),
	defineCommand({
		availability: 'project',
		disabledReasonKey: 'command.disabled.projectUnavailable',
		effectOwner: 'project',
		id: 'transport.toggle-loop',
		labelKey: 'transport.loop',
		placements: ['transport'],
		shortcut: { key: 'l' }
	}),
	defineCommand({
		availability: 'engine',
		disabledReasonKey: 'command.disabled.engineUnavailable',
		effectOwner: 'engine',
		id: 'transport.stop',
		labelKey: 'transport.stop',
		placements: ['transport'],
		shortcut: { key: 'Escape', shift: true }
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'layout.open-navigation',
		labelKey: 'layout.openNavigation',
		placements: ['window']
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'layout.open-context',
		labelKey: 'layout.openContext',
		placements: ['window']
	}),
	defineCommand({
		availability: 'drawer-open',
		disabledReasonKey: 'command.disabled.noDrawer',
		effectOwner: 'presentation',
		id: 'layout.close-drawer',
		labelKey: 'layout.closeDrawer',
		placements: ['window'],
		shortcut: { key: 'Escape' }
	})
] as const)

const commandIdSet: ReadonlySet<string> = new Set(commandIds)
const commandDefinitionById: ReadonlyMap<CommandId, CommandDefinition> = new Map(
	commandDefinitions.map((definition) => [definition.id, definition])
)

export const activityCommandDefinitions = Object.freeze(
	commandDefinitions.filter(({ placements }) => placements.includes('activity'))
)

export function isCommandId(value: string): value is CommandId {
	return commandIdSet.has(value)
}

export function commandDefinition(commandId: CommandId): CommandDefinition {
	const definition = commandDefinitionById.get(commandId)
	if (definition === undefined) throw new Error(`No command definition exists for ${commandId}.`)
	return definition
}

export function commandForView(view: StudioViewId): CommandId {
	const command = commandDefinitions.find((definition) => definition.view === view)
	if (command === undefined) throw new Error(`No command is registered for studio view ${view}.`)
	return command.id
}

export interface ShortcutEvent {
	readonly altKey: boolean
	readonly ctrlKey: boolean
	readonly key: string
	readonly metaKey: boolean
	readonly shiftKey: boolean
}

export function commandForShortcut(
	event: ShortcutEvent,
	platform: 'macos' | 'other'
): CommandId | null {
	const primary = platform === 'macos' ? event.metaKey : event.ctrlKey
	const definition = commandDefinitions.find(({ shortcut }) => {
		if (shortcut === undefined) return false
		if ((shortcut.primary ?? false) !== primary) return false
		if (shortcut.primary !== true && (event.ctrlKey || event.metaKey)) return false
		if ((shortcut.shift ?? false) !== event.shiftKey) return false
		if (event.altKey) return false
		return shortcut.key.toLowerCase() === event.key.toLowerCase()
	})
	return definition?.id ?? null
}
