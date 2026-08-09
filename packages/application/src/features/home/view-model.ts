export interface RecentPieceViewModel {
	readonly bpm: number
	readonly id: string
	readonly layerCount: number
	readonly name: string
}

export interface HomeViewModel {
	readonly recentPieces: readonly RecentPieceViewModel[]
}

export const homeViewModel: HomeViewModel = Object.freeze({
	recentPieces: Object.freeze([
		Object.freeze({ id: 'velvet-morning', name: 'Velvet Morning', bpm: 92, layerCount: 4 }),
		Object.freeze({ id: 'slow-orbit', name: 'Slow Orbit', bpm: 108, layerCount: 6 })
	])
})
