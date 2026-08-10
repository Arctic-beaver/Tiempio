import { createContext, useContext } from 'react'
import type { ResolvedCommandStates } from './command-availability.js'
import type { CommandId } from './command-registry.js'

export interface CommandContextValue {
	readonly commands: ResolvedCommandStates
	readonly execute: (commandId: CommandId) => boolean
	readonly looping: boolean
}

export const CommandContext = createContext<CommandContextValue | null>(null)

export function useCommands(): CommandContextValue {
	const context = useContext(CommandContext)
	if (context === null) throw new Error('useCommands must be used within CommandProvider.')
	return context
}
