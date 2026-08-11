import { ArrowRight, AudioLines, CircleDot, Drum, Plus, Upload } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useLocalization, type LocalizationKey } from '../../../../localization/src/index.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import {
	firstLayerViewModel,
	type FirstLayerViewModel,
	type LayerRoleViewModel
} from './view-model.js'

interface IntentRow {
	readonly descriptionKey: LocalizationKey
	readonly icon: ReactNode
	readonly id: LayerRoleViewModel['id'] | 'upload'
	readonly labelKey: LocalizationKey
}

const intentRows: readonly IntentRow[] = Object.freeze([
	Object.freeze({
		id: 'drums',
		labelKey: 'firstLayer.drums',
		descriptionKey: 'firstLayer.drumsDescription',
		icon: <Drum />
	}),
	Object.freeze({
		id: 'bass',
		labelKey: 'firstLayer.bass',
		descriptionKey: 'firstLayer.bassDescription',
		icon: <CircleDot />
	}),
	Object.freeze({
		id: 'chords',
		labelKey: 'firstLayer.chords',
		descriptionKey: 'firstLayer.chordsDescription',
		icon: <AudioLines />
	}),
	Object.freeze({
		id: 'upload',
		labelKey: 'firstLayer.upload',
		descriptionKey: 'firstLayer.uploadDescription',
		icon: <Upload />
	})
])

export interface FirstLayerViewProperties {
	readonly model?: FirstLayerViewModel
	readonly onChoose: (role: LayerRoleViewModel['id']) => void
}

export function FirstLayerView({
	model = firstLayerViewModel,
	onChoose
}: FirstLayerViewProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section
			className="studio-view first-layer-view"
			data-role-count={model.roles.length}
			data-testid="view-first-layer"
		>
			<StudioTopBar center={<TransportBar />} />
			<div className="project-space">
				<aside className="layer-list">
					<div className="layer-title">
						<span>{t('layers.title')}</span>
						<span>0</span>
					</div>
					<button className="add-layer" onClick={() => onChoose('bass')} type="button">
						<Plus aria-hidden="true" />
						{t('layers.add')}
					</button>
				</aside>
				<div className="canvas empty-canvas">
					<div aria-hidden="true" className="phrase-head">
						{Array.from({ length: 8 }, (_, index) => (
							<span className="bar-num" key={index}>
								{index + 1}
							</span>
						))}
					</div>
					<div className="first-layer">
						<div className="first-layer-inner">
							<h1>{t('firstLayer.title')}</h1>
							<p>{t('firstLayer.description')}</p>
							<div className="intent-list">
								{intentRows.map((row) => {
									const unavailable = row.id === 'upload'
									return (
										<button
											aria-disabled={unavailable || undefined}
											className="intent-row"
											disabled={unavailable}
											key={row.id}
											onClick={() => {
												if (!unavailable) onChoose(row.id)
											}}
											title={
												unavailable ? t('common.notAvailable') : undefined
											}
											type="button"
										>
											<span aria-hidden="true" className="round-symbol">
												{row.icon}
											</span>
											<span>
												<strong>{t(row.labelKey)}</strong>
												<small>{t(row.descriptionKey)}</small>
											</span>
											<ArrowRight aria-hidden="true" className="arrow" />
										</button>
									)
								})}
							</div>
						</div>
					</div>
					<div className="footer-guidance">
						<span>{t('firstLayer.footerGuidance')}</span>
						<span className="key-hint">
							<kbd>Space</kbd> Play <kbd>Ctrl</kbd>
							<kbd>K</kbd> {t('firstLayer.quickAction')}
						</span>
					</div>
				</div>
			</div>
		</section>
	)
}
