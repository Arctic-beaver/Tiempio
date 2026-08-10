export const desktopRuntimeChannels = Object.freeze({
	windowMinimize: 'tiempio:window:minimize',
	windowToggleMaximize: 'tiempio:window:toggle-maximize',
	windowRequestClose: 'tiempio:window:request-close',
	projectCreate: 'tiempio:projects:create',
	projectOpen: 'tiempio:projects:open',
	projectLoad: 'tiempio:projects:load',
	projectPersist: 'tiempio:projects:persist',
	projectPersistAs: 'tiempio:projects:persist-as',
	projectSaveCopy: 'tiempio:projects:save-copy',
	projectWriteRecovery: 'tiempio:projects:write-recovery',
	projectListRecoveries: 'tiempio:projects:list-recoveries',
	projectRestoreRecovery: 'tiempio:projects:restore-recovery',
	projectDiscardRecovery: 'tiempio:projects:discard-recovery',
	settingsGet: 'tiempio:settings:get',
	settingsSet: 'tiempio:settings:set',
	engineConnect: 'tiempio:engine:connect',
	engineDisconnect: 'tiempio:engine:disconnect',
	engineSend: 'tiempio:engine:send',
	engineGetHealth: 'tiempio:engine:get-health',
	engineEvent: 'tiempio:engine:event',
	engineHealth: 'tiempio:engine:health',
	commandExecute: 'tiempio:commands:execute',
	commandRequested: 'tiempio:commands:requested',
	lifecycleReady: 'tiempio:lifecycle:ready',
	lifecycleCloseRequested: 'tiempio:lifecycle:close-requested'
})

export type DesktopRuntimeChannel =
	(typeof desktopRuntimeChannels)[keyof typeof desktopRuntimeChannels]
