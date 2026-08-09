import { useCallback, useEffect, useMemo, type JSX, type ReactNode } from 'react'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { CommandContext, type CommandContextValue } from './CommandContext.js'
import { commandForShortcut, isCommandId, type CommandId } from './command-registry.js'

export interface CommandProviderProperties {
	readonly children: ReactNode
	readonly handlers: Readonly<Partial<Record<CommandId, () => void>>>
	readonly looping: boolean
	readonly playing: boolean
}

function acceptsTextInput(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	)
}

export function CommandProvider({
	children,
	handlers,
	looping,
	playing
}: CommandProviderProperties): JSX.Element {
	const runtime = useApplicationRuntime()
	const execute = useCallback(
		(commandId: CommandId): boolean => {
			const handler = handlers[commandId]
			if (handler === undefined) return false
			handler()
			return true
		},
		[handlers]
	)

	useEffect(() => {
		const handleShortcut = (event: KeyboardEvent): void => {
			if (event.defaultPrevented || acceptsTextInput(event.target)) return
			const commandId = commandForShortcut(
				event,
				navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'other'
			)
			if (commandId !== null && execute(commandId)) event.preventDefault()
		}
		document.addEventListener('keydown', handleShortcut)
		return () => document.removeEventListener('keydown', handleShortcut)
	}, [execute])

	useEffect(() => {
		if (runtime.commands.availability !== 'available') return
		return runtime.commands.api.onRequested((commandId) => {
			if (isCommandId(commandId)) execute(commandId)
		})
	}, [execute, runtime.commands])

	const value = useMemo<CommandContextValue>(
		() => ({ execute, looping, playing }),
		[execute, looping, playing]
	)
	return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}
