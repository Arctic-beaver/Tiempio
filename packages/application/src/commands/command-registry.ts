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

export interface CommandShortcut {
	readonly key: string
	readonly primary?: boolean
	readonly shift?: boolean
}

export interface CommandDefinition {
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
		id: 'studio.home',
		labelKey: 'nav.home',
		placements: ['activity'],
		shortcut: { key: '1', primary: true },
		view: 'home'
	}),
	defineCommand({
		id: 'studio.first-layer',
		labelKey: 'layers.add',
		placements: ['workflow'],
		view: 'first-layer'
	}),
	defineCommand({
		id: 'studio.sound-chooser',
		labelKey: 'soundChooser.title',
		placements: ['workflow'],
		view: 'sound-chooser'
	}),
	defineCommand({
		id: 'studio.piano-roll',
		labelKey: 'nav.piano',
		placements: ['activity', 'layer'],
		shortcut: { key: '2', primary: true },
		view: 'piano-roll'
	}),
	defineCommand({
		id: 'studio.drums',
		labelKey: 'nav.drums',
		placements: ['activity', 'layer'],
		shortcut: { key: '3', primary: true },
		view: 'drums'
	}),
	defineCommand({
		id: 'studio.arrangement',
		labelKey: 'nav.arrangement',
		placements: ['activity'],
		shortcut: { key: '4', primary: true },
		view: 'arrangement'
	}),
	defineCommand({
		id: 'studio.sound-sculpt',
		labelKey: 'nav.soundSculpt',
		placements: ['activity'],
		shortcut: { key: '5', primary: true },
		view: 'sound-sculpt'
	}),
	defineCommand({
		id: 'transport.toggle-playback',
		labelKey: 'transport.play',
		placements: ['transport'],
		shortcut: { key: ' ' }
	}),
	defineCommand({
		id: 'transport.toggle-loop',
		labelKey: 'transport.loop',
		placements: ['transport'],
		shortcut: { key: 'l' }
	}),
	defineCommand({
		id: 'transport.stop',
		labelKey: 'transport.stop',
		placements: ['transport'],
		shortcut: { key: 'Escape', shift: true }
	}),
	defineCommand({
		id: 'layout.open-navigation',
		labelKey: 'layout.openNavigation',
		placements: ['window']
	}),
	defineCommand({
		id: 'layout.open-context',
		labelKey: 'layout.openContext',
		placements: ['window']
	}),
	defineCommand({
		id: 'layout.close-drawer',
		labelKey: 'layout.closeDrawer',
		placements: ['window'],
		shortcut: { key: 'Escape' }
	})
] as const)

const commandIdSet: ReadonlySet<string> = new Set(commandIds)

export const activityCommandDefinitions = Object.freeze(
	commandDefinitions.filter(({ placements }) => placements.includes('activity'))
)

export function isCommandId(value: string): value is CommandId {
	return commandIdSet.has(value)
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
