import { createContext, useContext } from 'react'
import type {
	LayerCreationCoordinator,
	LayerCreationSnapshot
} from './layer-creation-coordinator.js'

export interface LayerCreationContextValue {
	readonly coordinator: LayerCreationCoordinator
	readonly snapshot: LayerCreationSnapshot
}

export const LayerCreationContext = createContext<LayerCreationContextValue | null>(null)

export function useLayerCreation(): LayerCreationContextValue {
	const context = useContext(LayerCreationContext)
	if (context === null) {
		throw new Error('useLayerCreation must be used within LayerCreationProvider.')
	}
	return context
}
