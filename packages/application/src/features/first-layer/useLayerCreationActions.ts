import { useCallback, useState } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { layerId, type LayerId } from '../../../../project-core/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { ProjectedLayerItem } from '../../project/projections/types.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { useLayerCreation } from './LayerCreationContext.js'
import type { LayerRoleViewModel } from './view-model.js'
import { commandsForLayerCreation } from './layer-creation-transaction.js'

function focusLayerControl(layer: LayerId | null): void {
	globalThis.queueMicrotask(() => {
		const selector =
			layer === null ? '[data-layer-add]' : `[data-layer-id="${CSS.escape(layer)}"]`
		document.querySelector<HTMLElement>(selector)?.focus()
	})
}

function focusDraftControl(): void {
	globalThis.queueMicrotask(() => {
		const controls = document.querySelectorAll<HTMLElement>('[data-layer-draft-focus]')
		const visible = [...controls].find((control) => control.getClientRects().length > 0)
		;(visible ?? controls[0])?.focus()
	})
}

export function useLayerCreationActions(): {
	readonly backToRole: () => void
	readonly cancel: () => void
	readonly chooseRole: (role: LayerRoleViewModel['id']) => void
	readonly commitDraft: () => Promise<boolean>
	readonly commitPending: boolean
	readonly continueDraft: () => void
	readonly openOrFocus: () => void
	readonly selectExistingLayer: (item: ProjectedLayerItem) => void
} {
	const { t } = useLocalization()
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const controller = useApplicationRuntimeController()
	const { coordinator, snapshot: creation } = useLayerCreation()
	const [commitPending, setCommitPending] = useState(false)

	const navigateToSelected = useCallback((): void => {
		const selected = projectSession.projections.layers.items.find(
			(item) => item.id === projectSession.selectedLayerId
		)
		execute(commandForView(selected?.view ?? 'first-layer'))
	}, [execute, projectSession.projections.layers.items, projectSession.selectedLayerId])

	const openOrFocus = useCallback((): void => {
		coordinator.openOrFocus({
			projectId: projectSession.snapshot.project.projectId,
			originSourceLayerId: projectSession.selectedLayerId
		})
		focusDraftControl()
	}, [coordinator, projectSession.selectedLayerId, projectSession.snapshot.project.projectId])

	const chooseRole = useCallback(
		(role: LayerRoleViewModel['id']): void => {
			if (coordinator.getSnapshot().draft === null) openOrFocus()
			coordinator.chooseRole({
				role,
				displayName: t(`firstLayer.${role}`),
				performance: {
					key: {
						tonic: projectSession.projections.transport.palette.tonic,
						mode: projectSession.projections.transport.palette.mode
					},
					octave: projectSession.projections.transport.octave
				}
			})
			if (role !== 'drums') execute(commandForView('sound-chooser'))
		},
		[
			coordinator,
			execute,
			openOrFocus,
			projectSession.projections.transport.octave,
			projectSession.projections.transport.palette.mode,
			projectSession.projections.transport.palette.tonic,
			t
		]
	)

	const continueDraft = useCallback((): void => {
		const draft = coordinator.resume()
		if (
			draft !== null &&
			draft.role !== null &&
			draft.role !== 'drums' &&
			draft.step !== 'choosing-role'
		) {
			execute(commandForView('sound-chooser'))
		}
	}, [coordinator, execute])

	const backToRole = useCallback((): void => {
		coordinator.backToRole()
		navigateToSelected()
	}, [coordinator, navigateToSelected])

	const cancel = useCallback((): void => {
		const origin = creation.draft?.originSourceLayerId ?? projectSession.selectedLayerId
		if (!coordinator.cancel()) return
		const surviving = projectSession.snapshot.project.layers.some(
			(layer) => layer.id === origin
		)
		focusLayerControl(surviving ? origin : null)
		navigateToSelected()
	}, [
		coordinator,
		creation.draft?.originSourceLayerId,
		navigateToSelected,
		projectSession.selectedLayerId,
		projectSession.snapshot.project.layers
	])

	const selectExistingLayer = useCallback(
		(item: ProjectedLayerItem): void => {
			coordinator.suspend()
			projectSession.selectLayer(item.id)
			execute(commandForView(item.view))
		},
		[coordinator, execute, projectSession]
	)

	const commitDraft = useCallback(async (): Promise<boolean> => {
		if (commitPending) return false
		const draft = coordinator.getSnapshot().draft
		const current = projectSession.getSnapshot()
		if (draft === null || draft.projectId !== current.project.projectId) return false
		setCommitPending(true)
		let prepared: ReturnType<typeof projectSession.prepareTransaction> | null = null
		try {
			const canonicalLayerId = layerId(projectSession.nextId('layer.ui'))
			prepared = projectSession.prepareTransaction(
				commandsForLayerCreation(draft, current.revision, canonicalLayerId)
			)
			if (!(await controller.preactivateProject(prepared))) {
				projectSession.discardTransaction(prepared)
				coordinator.reportError(
					'Audio could not accept the new brick. Try again or cancel.'
				)
				return false
			}
			projectSession.commitTransaction(prepared)
			coordinator.cancel()
			projectSession.selectLayer(canonicalLayerId)
			execute(commandForView(draft.role === 'drums' ? 'drums' : 'piano-roll'))
			focusLayerControl(canonicalLayerId)
			return true
		} catch (error) {
			if (prepared !== null) projectSession.discardTransaction(prepared)
			await controller.restoreProjectPlan()
			coordinator.reportError(
				error instanceof Error ? error.message : 'The brick could not be created.'
			)
			return false
		} finally {
			setCommitPending(false)
		}
	}, [commitPending, controller, coordinator, execute, projectSession])

	return {
		backToRole,
		cancel,
		chooseRole,
		commitDraft,
		commitPending,
		continueDraft,
		openOrFocus,
		selectExistingLayer
	}
}
