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
	'note.move-left',
	'note.move-right',
	'note.move-up',
	'note.move-down',
	'note.move-fine-left',
	'note.move-fine-right',
	'note.move-beat-left',
	'note.move-beat-right',
	'note.move-bar-left',
	'note.move-bar-right',
	'note.move-octave-up',
	'note.move-octave-down',
	'note.duration-shorter',
	'note.duration-longer',
	'note.duration-fine-shorter',
	'note.duration-fine-longer',
	'note.strength-decrease',
	'note.strength-increase',
	'note.delete',
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
export type CommandSettingsGroup = 'general' | 'transport' | 'note-editing'

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
	readonly settingsGroup?: CommandSettingsGroup
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'general',
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
		settingsGroup: 'transport',
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
		settingsGroup: 'transport',
		shortcuts: [{ code: 'KeyL', primary: true }]
	}),
	defineCommand({
		availability: 'engine',
		disabledReasonKey: 'command.disabled.engineUnavailable',
		effectOwner: 'engine',
		id: 'transport.stop',
		labelKey: 'transport.stop',
		placements: ['transport'],
		scope: 'global',
		settingsGroup: 'transport',
		shortcuts: [{ code: 'Escape', shift: true }]
	}),
	...(
		[
			['note.move-left', 'command.note.moveLeft', [{ code: 'ArrowLeft' }]],
			['note.move-right', 'command.note.moveRight', [{ code: 'ArrowRight' }]],
			['note.move-up', 'command.note.moveUp', [{ code: 'ArrowUp' }]],
			['note.move-down', 'command.note.moveDown', [{ code: 'ArrowDown' }]],
			[
				'note.move-fine-left',
				'command.note.moveFineLeft',
				[{ alt: true, code: 'ArrowLeft' }]
			],
			[
				'note.move-fine-right',
				'command.note.moveFineRight',
				[{ alt: true, code: 'ArrowRight' }]
			],
			[
				'note.move-beat-left',
				'command.note.moveBeatLeft',
				[{ code: 'ArrowLeft', shift: true }]
			],
			[
				'note.move-beat-right',
				'command.note.moveBeatRight',
				[{ code: 'ArrowRight', shift: true }]
			],
			[
				'note.move-bar-left',
				'command.note.moveBarLeft',
				[{ code: 'ArrowLeft', primary: true }]
			],
			[
				'note.move-bar-right',
				'command.note.moveBarRight',
				[{ code: 'ArrowRight', primary: true }]
			],
			[
				'note.move-octave-up',
				'command.note.moveOctaveUp',
				[{ code: 'ArrowUp', shift: true }]
			],
			[
				'note.move-octave-down',
				'command.note.moveOctaveDown',
				[{ code: 'ArrowDown', shift: true }]
			],
			['note.duration-shorter', 'command.note.durationShorter', [{ code: 'BracketLeft' }]],
			['note.duration-longer', 'command.note.durationLonger', [{ code: 'BracketRight' }]],
			[
				'note.duration-fine-shorter',
				'command.note.durationFineShorter',
				[{ alt: true, code: 'BracketLeft' }]
			],
			[
				'note.duration-fine-longer',
				'command.note.durationFineLonger',
				[{ alt: true, code: 'BracketRight' }]
			],
			[
				'note.strength-decrease',
				'command.note.strengthDecrease',
				[{ code: 'Minus' }, { code: 'NumpadSubtract' }]
			],
			[
				'note.strength-increase',
				'command.note.strengthIncrease',
				[{ code: 'Equal' }, { code: 'NumpadAdd' }]
			],
			['note.delete', 'command.note.delete', [{ code: 'Delete' }, { code: 'Backspace' }]]
		] as const
	).map(([id, labelKey, shortcuts]) =>
		defineCommand({
			availability: 'project',
			disabledReasonKey: 'command.disabled.projectUnavailable',
			effectOwner: 'project',
			id,
			labelKey,
			placements: ['workflow'],
			scope: 'piano-roll',
			settingsGroup: 'note-editing',
			shortcuts
		})
	),
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

export function shortcutsOverlap(first: CommandShortcut, second: CommandShortcut): boolean {
	return (
		first.code === second.code &&
		(first.primary ?? false) === (second.primary ?? false) &&
		(first.shift ?? false) === (second.shift ?? false) &&
		(first.alt ?? false) === (second.alt ?? false) &&
		(first.platform === undefined ||
			first.platform === 'all' ||
			second.platform === undefined ||
			second.platform === 'all' ||
			first.platform === second.platform)
	)
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
			shortcutsForCommand(definition.id, overrides).some((candidate) =>
				shortcutsOverlap(candidate, shortcut)
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
