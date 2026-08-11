import { Palette } from 'lucide-react'
import type { JSX } from 'react'
import { Popover } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import { SongPalettePanel } from './SongPalettePanel.js'

export function SongPalettePopover(): JSX.Element {
	const { t } = useLocalization()
	const { projections } = useProjectSession()
	const palette = projections.transport.palette
	const character = t(
		palette.character === 'open'
			? 'songPalette.characterOpen'
			: 'songPalette.characterReflective'
	)
	return (
		<Popover icon={<Palette />} label={`${palette.name} · ${character}`} placement="start">
			{(close) => (
				<SongPalettePanel
					onApplied={close}
					ownerId="song-palette-popover"
					variant="panel"
				/>
			)}
		</Popover>
	)
}
