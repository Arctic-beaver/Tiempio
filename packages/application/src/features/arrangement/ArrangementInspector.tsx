import { Copy, GitBranchPlus, Pencil, Scissors, Trash2, X } from 'lucide-react'
import type { JSX } from 'react'
import { IconButton, ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type { ProjectedLayerItem } from '../../project/projections/types.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { ArrangementInstanceViewModel, ArrangementLayerViewModel } from './view-model.js'

export interface ArrangementInspectorProperties {
	readonly instance: ArrangementInstanceViewModel | null
	readonly layer: ProjectedLayerItem | undefined
	readonly modelLayer: ArrangementLayerViewModel | undefined
	readonly onClose: () => void
	readonly onDelete: () => void
	readonly onDuplicateLinked: () => void
	readonly onDuplicateVariation: () => void
	readonly onEditSource: () => void
	readonly onSplit: () => void
}

function InspectorAction({
	description,
	icon,
	label,
	onClick,
	tone
}: {
	readonly description: string
	readonly icon: JSX.Element
	readonly label: string
	readonly onClick: () => void
	readonly tone?: 'danger'
}): JSX.Element {
	return (
		<button
			className="composition-inspector__action"
			data-tone={tone}
			onClick={onClick}
			type="button"
		>
			{icon}
			<span>
				<strong>{label}</strong>
				<small>{description}</small>
			</span>
		</button>
	)
}

export function ArrangementInspector({
	instance,
	layer,
	modelLayer,
	onClose,
	onDelete,
	onDuplicateLinked,
	onDuplicateVariation,
	onEditSource,
	onSplit
}: ArrangementInspectorProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<aside className="composition-inspector">
			<header>
				<div>
					<small>
						{t(instance === null ? 'arrangement.source' : 'arrangement.linkedInstance')}
					</small>
					<h2>{instance === null ? editorLayerName(layer) : editorLayerSound(layer)}</h2>
				</div>
				<IconButton
					icon={<X />}
					label={t('arrangement.hideInspector')}
					onClick={onClose}
					size="small"
				/>
			</header>
			<ScrollSurface className="composition-inspector__scroll">
				<p>
					{t(
						instance === null
							? 'arrangement.sourceInspectorDescription'
							: 'arrangement.instanceInspectorDescription'
					)}
				</p>
				<dl className="composition-inspector__facts">
					<div>
						<dt>{t('arrangement.materialLength')}</dt>
						<dd>{modelLayer?.materialLengthTicks ?? 0}</dd>
					</div>
					<div>
						<dt>{t('arrangement.cyclePause')}</dt>
						<dd>{modelLayer?.tailRestTicks ?? 0}</dd>
					</div>
					<div>
						<dt>{t('arrangement.instancesInSong')}</dt>
						<dd>{modelLayer?.instances.length ?? 0}</dd>
					</div>
				</dl>
				{instance === null ? (
					<InspectorAction
						description={t('arrangement.editSourceDescription')}
						icon={<Pencil aria-hidden="true" />}
						label={t('arrangement.editSource')}
						onClick={onEditSource}
					/>
				) : (
					<>
						<InspectorAction
							description={t('arrangement.splitDescription')}
							icon={<Scissors aria-hidden="true" />}
							label={t('arrangement.splitInstance')}
							onClick={onSplit}
						/>
						<InspectorAction
							description={t('arrangement.duplicateLinkedDescription')}
							icon={<Copy aria-hidden="true" />}
							label={t('arrangement.duplicateLinked')}
							onClick={onDuplicateLinked}
						/>
						<InspectorAction
							description={t('arrangement.variationDescription')}
							icon={<GitBranchPlus aria-hidden="true" />}
							label={t('arrangement.createVariation')}
							onClick={onDuplicateVariation}
						/>
						<InspectorAction
							description={t('arrangement.deleteInstanceDescription')}
							icon={<Trash2 aria-hidden="true" />}
							label={t('arrangement.deleteInstance')}
							onClick={onDelete}
							tone="danger"
						/>
					</>
				)}
			</ScrollSurface>
		</aside>
	)
}
