import { ArrowLeft, Check, Pause, Play, X } from 'lucide-react'
import type { JSX, KeyboardEvent } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { useLayerCreation } from './LayerCreationContext.js'
import { useLayerCreationActions } from './useLayerCreationActions.js'
import type { LayerRoleViewModel } from './view-model.js'

const roleChoices = Object.freeze<readonly LayerRoleViewModel['id'][]>([
	'drums',
	'bass',
	'chords',
	'melody'
])

export interface LayerCreationCardProperties {
	readonly instanceId: string
}

export function LayerCreationCard({ instanceId }: LayerCreationCardProperties): JSX.Element | null {
	const { t } = useLocalization()
	const { snapshot } = useLayerCreation()
	const actions = useLayerCreationActions()
	const draft = snapshot.draft
	if (draft === null) return null
	const headingId = `${instanceId}-layer-draft-heading`
	const progress =
		draft.role === null
			? t('layerCreation.chooseRole')
			: draft.step === 'choosing-sound'
				? t('layerCreation.choosingSound', { name: draft.displayName ?? '' })
				: t('layerCreation.ready', { name: draft.displayName ?? '' })
	return (
		<section
			aria-busy={snapshot.commitPending || undefined}
			aria-labelledby={headingId}
			className="layer-creation-card"
			data-step={draft.step}
			data-suspended={draft.suspended || undefined}
			onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
				if (event.key !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				if (draft.step === 'choosing-role') actions.cancel()
				else actions.backToRole()
			}}
		>
			<header>
				<div>
					<span className="layer-creation-card__eyebrow">{t('layerCreation.draft')}</span>
					<h2 id={headingId}>{t('layerCreation.newBrick')}</h2>
				</div>
				<button
					aria-label={t('layerCreation.cancel')}
					className="layer-creation-card__icon"
					onClick={actions.cancel}
					type="button"
				>
					<X aria-hidden="true" />
				</button>
			</header>
			<p className="layer-creation-card__progress">
				{draft.suspended && <Pause aria-hidden="true" />}
				{progress}
			</p>
			{draft.error !== null && (
				<p className="layer-creation-card__error" role="alert">
					{draft.error}
				</p>
			)}
			{draft.suspended ? (
				<div className="layer-creation-card__actions">
					<button
						className="layer-creation-card__primary"
						data-layer-draft-focus
						disabled={snapshot.commitPending}
						onClick={actions.continueDraft}
						type="button"
					>
						<Play aria-hidden="true" />
						{t('layerCreation.continue')}
					</button>
				</div>
			) : draft.step === 'choosing-role' ? (
				<div
					aria-label={t('layerCreation.chooseRole')}
					className="layer-creation-card__roles"
					role="group"
				>
					{roleChoices.map((role) => (
						<button
							data-layer-draft-role
							data-layer-draft-focus
							disabled={snapshot.commitPending}
							key={role}
							onClick={() => actions.chooseRole(role)}
							type="button"
						>
							{t(`firstLayer.${role}`)}
						</button>
					))}
				</div>
			) : (
				<div className="layer-creation-card__actions">
					{draft.step === 'choosing-sound' ? (
						<button
							className="layer-creation-card__primary"
							data-layer-draft-focus
							disabled={snapshot.commitPending}
							onClick={actions.continueDraft}
							type="button"
						>
							<Play aria-hidden="true" />
							{t('layerCreation.continue')}
						</button>
					) : draft.role === 'drums' ? (
						<button
							className="layer-creation-card__primary"
							data-layer-draft-focus
							disabled={snapshot.commitPending}
							onClick={() => void actions.commitDraft()}
							type="button"
						>
							<Check aria-hidden="true" />
							{t('layerCreation.useKit')}
						</button>
					) : null}
					<button
						className="layer-creation-card__secondary"
						disabled={snapshot.commitPending}
						onClick={actions.backToRole}
						type="button"
					>
						<ArrowLeft aria-hidden="true" />
						{t('common.back')}
					</button>
				</div>
			)}
			<span aria-live="polite" className="visually-hidden">
				{snapshot.announcement}
			</span>
		</section>
	)
}
