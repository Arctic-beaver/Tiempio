import { useLayerCreationActions } from './useLayerCreationActions.js'
import type { LayerRoleViewModel } from './view-model.js'

export function useFirstLayerActions(): {
	readonly chooseLayer: (choice: LayerRoleViewModel['id']) => void
	readonly open: () => void
} {
	const creation = useLayerCreationActions()
	return { chooseLayer: creation.chooseRole, open: creation.openOrFocus }
}
