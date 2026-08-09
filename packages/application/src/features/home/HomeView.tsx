import { ArrowRight, FileMusic, FolderOpen, Plus } from 'lucide-react'
import type { JSX } from 'react'
import { TextButton } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { homeViewModel, type HomeViewModel } from './view-model.js'

export interface HomeViewProperties {
	readonly model?: HomeViewModel
	readonly onCreate: () => void
}

export function HomeView({ model = homeViewModel, onCreate }: HomeViewProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section className="studio-view home-view" data-testid="view-home">
			<div className="home-view__hero">
				<p className="studio-eyebrow">{t('home.eyebrow')}</p>
				<h1>{t('home.title')}</h1>
				<p className="studio-lede">{t('home.description')}</p>
				<div className="home-view__actions">
					<TextButton icon={<Plus />} onClick={onCreate} tone="accent">
						{t('home.newProject')}
					</TextButton>
					<TextButton disabled icon={<FolderOpen />} title={t('common.notAvailable')}>
						{t('home.openProject')}
					</TextButton>
				</div>
			</div>
			<div className="home-view__recent">
				<div className="studio-section-heading">
					<div>
						<span className="studio-kicker">02</span>
						<h2>{t('home.recent')}</h2>
					</div>
					<FileMusic aria-hidden="true" />
				</div>
				<div className="home-view__piece-list">
					{model.recentPieces.map((piece) => (
						<button className="home-view__piece" disabled key={piece.id} type="button">
							<span>
								<strong>{piece.name}</strong>
								<small>{piece.detail}</small>
							</span>
							<ArrowRight aria-hidden="true" />
						</button>
					))}
				</div>
			</div>
		</section>
	)
}
