export const studioViewIds = Object.freeze([
	'home',
	'first-layer',
	'sound-chooser',
	'piano-roll',
	'drums',
	'arrangement',
	'sound-sculpt'
] as const)

export type StudioViewId = (typeof studioViewIds)[number]
export type StudioDrawer = 'navigation' | 'context' | null

export interface StudioNavigationState {
	readonly activeDrawer: StudioDrawer
	readonly activeView: StudioViewId
}

export const initialStudioNavigationState: StudioNavigationState = Object.freeze({
	activeDrawer: null,
	activeView: 'home'
})
