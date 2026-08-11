import type { JSX } from 'react'
import { ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { SongPalettePanel } from './SongPalettePanel.js'

export interface SongPaletteSetupViewProperties {
	readonly onBack: () => void
	readonly onComplete: () => void
}

export function SongPaletteSetupView({
	onBack,
	onComplete
}: SongPaletteSetupViewProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section className="studio-view song-palette-setup" data-testid="view-song-palette">
			<StudioTopBar
				center={<div className="workflow-step">{t('songPalette.step')}</div>}
				onBack={onBack}
				subtitle={t('songPalette.setupSubtitle')}
				title={t('songPalette.setupTitle')}
			/>
			<ScrollSurface className="song-palette-setup__body">
				<p className="song-palette-setup__intro">{t('songPalette.setupDescription')}</p>
				<SongPalettePanel
					onApplied={onComplete}
					ownerId="song-palette-setup"
					variant="setup"
				/>
			</ScrollSurface>
		</section>
	)
}
