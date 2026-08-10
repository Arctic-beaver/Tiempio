import { useCallback, useEffect, useMemo, type JSX, type ReactNode } from 'react'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import {
	executeResolvedCommand,
	resolveCommandStates,
	type CommandAvailabilityContext,
	type CommandHandlerMap
} from './command-availability.js'
import { CommandContext, type CommandContextValue } from './CommandContext.js'
import { commandForShortcut, isCommandId, type CommandId } from './command-registry.js'

export interface CommandProviderProperties {
	readonly availability: CommandAvailabilityContext
	readonly children: ReactNode
	readonly handlers: CommandHandlerMap
	readonly looping: boolean
}

function acceptsTextInput(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	)
}

export function CommandProvider({
	availability,
	children,
	handlers,
	looping
}: CommandProviderProperties): JSX.Element {
	const runtime = useApplicationRuntime()
	const commands = useMemo(
		() => resolveCommandStates(availability, handlers),
		[availability, handlers]
	)
	const execute = useCallback(
		(commandId: CommandId): boolean => executeResolvedCommand(commandId, commands, handlers),
		[commands, handlers]
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
		() => ({ commands, execute, looping }),
		[commands, execute, looping]
	)
	return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}
