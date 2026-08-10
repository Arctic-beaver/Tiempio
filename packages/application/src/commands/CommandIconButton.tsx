import type { JSX } from 'react'
import {
	IconButton,
	Tooltip,
	type IconButtonProperties,
	type TooltipProperties
} from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { useCommands } from './CommandContext.js'
import type { CommandId } from './command-registry.js'

export interface CommandIconButtonProperties extends Omit<
	IconButtonProperties,
	'disabled' | 'label' | 'onClick'
> {
	readonly commandId: CommandId
	readonly label: string
	readonly tooltip?: string
	readonly tooltipPlacement?: TooltipProperties['placement']
}

export function CommandIconButton({
	commandId,
	label,
	tooltip = label,
	tooltipPlacement,
	...iconButtonProperties
}: CommandIconButtonProperties): JSX.Element {
	const { t } = useLocalization()
	const { commands, execute } = useCommands()
	const command = commands[commandId]
	const content = command.available ? tooltip : t(command.disabledReasonKey)
	return (
		<Tooltip content={content} placement={tooltipPlacement}>
			<IconButton
				{...iconButtonProperties}
				aria-disabled={!command.available || undefined}
				label={label}
				onClick={() => execute(commandId)}
			/>
		</Tooltip>
	)
}
