import { ArrowRight, FolderOpen, Headphones, Plus, Waves } from 'lucide-react'
import type { JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { homeViewModel, type HomeViewModel } from './view-model.js'

const visualRecentPieces = Object.freeze([
	Object.freeze({ name: 'Night Drive', metaKey: 'home.recentNight', bpm: 128 }),
	Object.freeze({ name: 'Quiet Signal', metaKey: 'home.recentQuiet', bpm: 112 }),
	Object.freeze({ name: 'Glass Room', metaKey: 'home.recentGlass', bpm: 96 })
] as const)

export interface HomeViewProperties {
	readonly model?: HomeViewModel
	readonly onCreate: () => void
	readonly onStartWithSound: () => void
}

export function HomeView({
	model = homeViewModel,
	onCreate,
	onStartWithSound
}: HomeViewProperties): JSX.Element {
	const { t } = useLocalization()
	const { commands, execute } = useCommands()
	const openProject = commands['project.open']
	return (
		<section className="studio-view home-view" data-testid="view-home">
			<div className="home">
				<div className="home-main">
					<div className="eyebrow">{t('home.eyebrow')}</div>
					<h1>
						{t('home.titleLead')} <em>{t('home.titleEmphasis')}</em>
					</h1>
					<p className="home-intro">{t('home.description')}</p>
					<div className="start-actions">
						<button className="start-row" onClick={onCreate} type="button">
							<span className="round-symbol">
								<Plus aria-hidden="true" />
							</span>
							<span>
								<strong>{t('home.newProject')}</strong>
								<small>{t('home.newProjectDescription')}</small>
							</span>
							<ArrowRight aria-hidden="true" className="arrow" />
						</button>
						<button className="start-row" onClick={onStartWithSound} type="button">
							<span className="round-symbol">
								<Waves aria-hidden="true" />
							</span>
							<span>
								<strong>{t('home.startWithSound')}</strong>
								<small>{t('home.startWithSoundDescription')}</small>
							</span>
							<ArrowRight aria-hidden="true" className="arrow" />
						</button>
						<button
							aria-disabled={!openProject.available || undefined}
							className="start-row"
							disabled={!openProject.available}
							onClick={() => execute('project.open')}
							title={
								openProject.available ? undefined : t(openProject.disabledReasonKey)
							}
							type="button"
						>
							<span className="round-symbol">
								<FolderOpen aria-hidden="true" />
							</span>
							<span>
								<strong>{t('home.openProject')}</strong>
								<small>{t('home.openProjectDescription')}</small>
							</span>
							<ArrowRight aria-hidden="true" className="arrow" />
						</button>
					</div>
				</div>
				<aside className="recent-panel" data-project-revision={model.recentPieces.length}>
					<div className="panel-title">
						<span>{t('home.recent')}</span>
						<span>{visualRecentPieces.length}</span>
					</div>
					<div className="recent-list">
						{visualRecentPieces.map((piece) => (
							<div className="recent-item" key={piece.name}>
								<span className="round-symbol">
									<Waves aria-hidden="true" />
								</span>
								<span>
									<span className="recent-name">{piece.name}</span>
									<span className="recent-meta">{t(piece.metaKey)}</span>
								</span>
								<span className="recent-bpm">{piece.bpm}</span>
							</div>
						))}
					</div>
					<div className="inspiration-note">
						<Headphones aria-hidden="true" />
						<span>
							<strong>{t('home.inspirationTitle')}</strong>
							<br />
							{t('home.inspirationDescription')}
						</span>
					</div>
				</aside>
			</div>
		</section>
	)
}
