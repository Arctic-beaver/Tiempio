import type {
	SettingsSnapshot,
	ShortcutBindingSnapshot,
	ShortcutOverrideSnapshot
} from '../../../contracts/src/index.js'
import {
	commandIds,
	isCommandId,
	shortcutSignature,
	type CommandId,
	type CommandShortcut,
	type CommandShortcutOverrides,
	type ShortcutEvent
} from './command-registry.js'

export function shortcutFromEvent(
	event: ShortcutEvent,
	platform: 'macos' | 'other'
): CommandShortcut {
	return Object.freeze({
		alt: event.altKey,
		code: event.code,
		platform: 'all' as const,
		primary: platform === 'macos' ? event.metaKey : event.ctrlKey,
		shift: event.shiftKey
	})
}

export function isReservedShortcut(
	shortcut: CommandShortcut,
	platform: 'macos' | 'other'
): boolean {
	if (platform === 'other' && shortcut.alt === true && shortcut.code === 'F4') return true
	if (shortcut.primary !== true) return false
	return ['KeyQ', 'KeyW'].includes(shortcut.code)
}

export function serializeShortcutOverrides(
	overrides: CommandShortcutOverrides
): readonly ShortcutOverrideSnapshot[] {
	return Object.freeze(
		commandIds.flatMap((commandId) => {
			const bindings = overrides[commandId]
			if (bindings === undefined) return []
			return [
				Object.freeze({
					commandId,
					bindings: Object.freeze(
						bindings.map<ShortcutBindingSnapshot>((binding) =>
							Object.freeze({
								alt: binding.alt === true,
								code: binding.code,
								platform: binding.platform ?? 'all',
								primary: binding.primary === true,
								shift: binding.shift === true
							})
						)
					)
				})
			]
		})
	)
}

export function deserializeShortcutOverrides(snapshot: SettingsSnapshot): CommandShortcutOverrides {
	const entries: [CommandId, readonly CommandShortcut[]][] = []
	for (const override of snapshot.shortcutOverrides) {
		if (!isCommandId(override.commandId)) continue
		entries.push([
			override.commandId,
			Object.freeze(
				override.bindings.map((binding) =>
					Object.freeze({
						alt: binding.alt,
						code: binding.code,
						platform: binding.platform,
						primary: binding.primary,
						shift: binding.shift
					})
				)
			)
		])
	}
	return Object.freeze(Object.fromEntries(entries) as CommandShortcutOverrides)
}

export function withShortcutBindings(
	overrides: CommandShortcutOverrides,
	commandId: CommandId,
	bindings: readonly CommandShortcut[]
): CommandShortcutOverrides {
	const unique = [
		...new Map(bindings.map((binding) => [shortcutSignature(binding), binding])).values()
	]
	return Object.freeze({ ...overrides, [commandId]: Object.freeze(unique) })
}

export function withoutShortcutBinding(
	overrides: CommandShortcutOverrides,
	commandId: CommandId,
	shortcut: CommandShortcut
): CommandShortcutOverrides {
	const signature = shortcutSignature(shortcut)
	const current = overrides[commandId]
	if (current === undefined) return overrides
	return withShortcutBindings(
		overrides,
		commandId,
		current.filter((binding) => shortcutSignature(binding) !== signature)
	)
}
