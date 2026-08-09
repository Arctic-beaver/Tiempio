import { createContext, useContext } from 'react'
import type { CommandId } from './command-registry.js'

export interface CommandContextValue {
	readonly execute: (commandId: CommandId) => boolean
	readonly looping: boolean
	readonly playing: boolean
}

export const CommandContext = createContext<CommandContextValue | null>(null)

export function useCommands(): CommandContextValue {
	const context = useContext(CommandContext)
	if (context === null) throw new Error('useCommands must be used within CommandProvider.')
	return context
}
