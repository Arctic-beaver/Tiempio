import { Redo2, Undo2 } from 'lucide-react'
import type { JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { CommandIconButton } from './CommandIconButton.js'

export function ProjectHistoryControls(): JSX.Element {
	const { t } = useLocalization()
	return (
		<>
			<CommandIconButton
				className="icon-button"
				commandId="project.undo"
				icon={<Undo2 />}
				label={t('arrangement.undo')}
			/>
			<CommandIconButton
				className="icon-button"
				commandId="project.redo"
				icon={<Redo2 />}
				label={t('arrangement.redo')}
			/>
		</>
	)
}
