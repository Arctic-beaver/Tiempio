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
	'project.undo',
	'project.redo',
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
export type CommandAvailabilityRequirement =
	'always' | 'drawer-open' | 'engine' | 'history-redo' | 'history-undo' | 'project'
export type CommandScope = 'global' | 'piano-roll'
export type ShortcutPlatform = 'all' | 'macos' | 'other'

export interface CommandShortcut {
	readonly alt?: boolean
	readonly code: string
	readonly platform?: ShortcutPlatform
	readonly primary?: boolean
	readonly shift?: boolean
}

export type CommandShortcutOverrides = Readonly<
	Partial<Record<CommandId, readonly CommandShortcut[]>>
>

export interface CommandDefinition {
	readonly availability: CommandAvailabilityRequirement
	readonly disabledReasonKey: LocalizationKey
	readonly effectOwner: CommandEffectOwner
	readonly id: CommandId
	readonly labelKey: LocalizationKey
	readonly placements: readonly CommandPlacement[]
	readonly scope: CommandScope
	readonly shortcuts?: readonly CommandShortcut[]
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
		scope: 'global',
		shortcuts: [{ code: 'Digit1', primary: true }],
		view: 'home'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.first-layer',
		labelKey: 'layers.add',
		placements: ['workflow'],
		scope: 'global',
		view: 'first-layer'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.sound-chooser',
		labelKey: 'soundChooser.title',
		placements: ['workflow'],
		scope: 'global',
		view: 'sound-chooser'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.piano-roll',
		labelKey: 'nav.piano',
		placements: ['activity', 'layer'],
		scope: 'global',
		shortcuts: [{ code: 'Digit2', primary: true }],
		view: 'piano-roll'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.drums',
		labelKey: 'nav.drums',
		placements: ['activity', 'layer'],
		scope: 'global',
		shortcuts: [{ code: 'Digit3', primary: true }],
		view: 'drums'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.arrangement',
		labelKey: 'nav.arrangement',
		placements: ['activity'],
		scope: 'global',
		shortcuts: [{ code: 'Digit4', primary: true }],
		view: 'arrangement'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'studio.sound-sculpt',
		labelKey: 'nav.soundSculpt',
		placements: ['activity'],
		scope: 'global',
		shortcuts: [{ code: 'Digit5', primary: true }],
		view: 'sound-sculpt'
	}),
	defineCommand({
		availability: 'history-undo',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'project',
		id: 'project.undo',
		labelKey: 'arrangement.undo',
		placements: ['window'],
		scope: 'global',
		shortcuts: [{ code: 'KeyZ', primary: true }]
	}),
	defineCommand({
		availability: 'history-redo',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'project',
		id: 'project.redo',
		labelKey: 'arrangement.redo',
		placements: ['window'],
		scope: 'global',
		shortcuts: [
			{ code: 'KeyZ', primary: true, shift: true },
			{ code: 'KeyY', platform: 'other', primary: true }
		]
	}),
	defineCommand({
		availability: 'engine',
		disabledReasonKey: 'command.disabled.engineUnavailable',
		effectOwner: 'engine',
		id: 'transport.toggle-playback',
		labelKey: 'transport.play',
		placements: ['transport'],
		scope: 'global',
		shortcuts: [{ code: 'Space' }]
	}),
	defineCommand({
		availability: 'project',
		disabledReasonKey: 'command.disabled.projectUnavailable',
		effectOwner: 'project',
		id: 'transport.toggle-loop',
		labelKey: 'transport.loop',
		placements: ['transport'],
		scope: 'global',
		shortcuts: [{ code: 'KeyL' }]
	}),
	defineCommand({
		availability: 'engine',
		disabledReasonKey: 'command.disabled.engineUnavailable',
		effectOwner: 'engine',
		id: 'transport.stop',
		labelKey: 'transport.stop',
		placements: ['transport'],
		scope: 'global',
		shortcuts: [{ code: 'Escape', shift: true }]
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'layout.open-navigation',
		labelKey: 'layout.openNavigation',
		placements: ['window'],
		scope: 'global'
	}),
	defineCommand({
		availability: 'always',
		disabledReasonKey: 'command.disabled.unavailable',
		effectOwner: 'presentation',
		id: 'layout.open-context',
		labelKey: 'layout.openContext',
		placements: ['window'],
		scope: 'global'
	}),
	defineCommand({
		availability: 'drawer-open',
		disabledReasonKey: 'command.disabled.noDrawer',
		effectOwner: 'presentation',
		id: 'layout.close-drawer',
		labelKey: 'layout.closeDrawer',
		placements: ['window'],
		scope: 'global',
		shortcuts: [{ code: 'Escape' }]
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
	readonly code: string
	readonly ctrlKey: boolean
	readonly metaKey: boolean
	readonly shiftKey: boolean
}

function platformMatches(shortcut: CommandShortcut, platform: 'macos' | 'other'): boolean {
	return (
		shortcut.platform === undefined ||
		shortcut.platform === 'all' ||
		shortcut.platform === platform
	)
}

function shortcutMatches(
	event: ShortcutEvent,
	shortcut: CommandShortcut,
	platform: 'macos' | 'other'
): boolean {
	if (!platformMatches(shortcut, platform)) return false
	const primary = platform === 'macos' ? event.metaKey : event.ctrlKey
	const secondaryPrimary = platform === 'macos' ? event.ctrlKey : event.metaKey
	if ((shortcut.primary ?? false) !== primary || secondaryPrimary) return false
	if ((shortcut.shift ?? false) !== event.shiftKey) return false
	if ((shortcut.alt ?? false) !== event.altKey) return false
	return shortcut.code === event.code
}

export function shortcutsForCommand(
	commandId: CommandId,
	overrides: CommandShortcutOverrides = {}
): readonly CommandShortcut[] {
	return overrides[commandId] ?? commandDefinition(commandId).shortcuts ?? []
}

export function shortcutSignature(shortcut: CommandShortcut): string {
	return [
		shortcut.platform ?? 'all',
		shortcut.primary === true ? 'primary' : '-',
		shortcut.shift === true ? 'shift' : '-',
		shortcut.alt === true ? 'alt' : '-',
		shortcut.code
	].join(':')
}

export function shortcutConflict(
	commandId: CommandId,
	shortcut: CommandShortcut,
	scope: CommandScope,
	overrides: CommandShortcutOverrides = {}
): CommandId | null {
	const conflict = commandDefinitions.find(
		(definition) =>
			definition.id !== commandId &&
			(definition.scope === 'global' || scope === 'global' || definition.scope === scope) &&
			shortcutsForCommand(definition.id, overrides).some(
				(candidate) =>
					candidate.code === shortcut.code &&
					(candidate.primary ?? false) === (shortcut.primary ?? false) &&
					(candidate.shift ?? false) === (shortcut.shift ?? false) &&
					(candidate.alt ?? false) === (shortcut.alt ?? false) &&
					(candidate.platform === undefined ||
						candidate.platform === 'all' ||
						shortcut.platform === undefined ||
						shortcut.platform === 'all' ||
						candidate.platform === shortcut.platform)
			)
	)
	return conflict?.id ?? null
}

export function commandForShortcut(
	event: ShortcutEvent,
	platform: 'macos' | 'other',
	activeScopes: readonly CommandScope[] = ['global'],
	overrides: CommandShortcutOverrides = {}
): CommandId | null {
	const scopes = new Set<CommandScope>(['global', ...activeScopes])
	const definition = commandDefinitions.find(
		(candidate) =>
			scopes.has(candidate.scope) &&
			shortcutsForCommand(candidate.id, overrides).some((shortcut) =>
				shortcutMatches(event, shortcut, platform)
			)
	)
	return definition?.id ?? null
}
