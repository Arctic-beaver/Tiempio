import { useCallback } from 'react'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'

export function useSongPaletteActions(): {
	readonly complete: () => void
	readonly returnToSound: () => void
} {
	const { execute } = useCommands()
	const complete = useCallback(() => {
		execute(commandForView('piano-roll'))
	}, [execute])
	const returnToSound = useCallback(() => {
		execute(commandForView('sound-chooser'))
	}, [execute])
	return { complete, returnToSound }
}
