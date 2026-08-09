export interface RecentPieceViewModel {
	readonly detail: string
	readonly id: string
	readonly name: string
}

export interface HomeViewModel {
	readonly recentPieces: readonly RecentPieceViewModel[]
}

export const homeViewModel: HomeViewModel = Object.freeze({
	recentPieces: Object.freeze([
		Object.freeze({
			id: 'velvet-morning',
			name: 'Velvet Morning',
			detail: '92 BPM · 4 layers'
		}),
		Object.freeze({ id: 'slow-orbit', name: 'Slow Orbit', detail: '108 BPM · 6 layers' })
	])
})
