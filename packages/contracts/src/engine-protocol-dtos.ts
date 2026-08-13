import {
	engineCapabilityCodes,
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	nativeHostCapabilityCodes,
	type EngineCapabilityCode,
	type EngineCommandType,
	type EngineDiagnosticCode,
	type EngineEventType
} from './generated/engine-protocol.generated.js'
import {
	enginePatchModelVersion,
	engineRenderPlanVersion,
	type EngineWireRenderPlan
} from './engine-render-plan.js'

export {
	engineCapabilityCodes,
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	nativeHostCapabilityCodes
}
export type { EngineCapabilityCode, EngineCommandType, EngineDiagnosticCode, EngineEventType }

export interface EngineHandshake {
	readonly capabilities: readonly EngineCapabilityCode[]
	readonly patchModelVersion: typeof enginePatchModelVersion
	readonly peer: 'application' | 'native-host' | 'web-worklet'
	readonly protocolVersion: number
	readonly renderPlanVersion: typeof engineRenderPlanVersion
}

type EmptyPayload = Readonly<Record<never, never>>

export type EngineRenderPlanDeltaChange =
	| { readonly gain: number; readonly layerId: string; readonly type: 'layer-gain' }
	| { readonly layerId: string; readonly pan: number; readonly type: 'layer-pan' }

export interface EnginePreviewEvent {
	readonly durationMs: number
	readonly offsetMs: number
	readonly pitches: readonly number[]
	readonly velocity: number
}

export interface EngineCommandPayloadByType {
	readonly handshake: EngineHandshake
	readonly 'configure-audio': {
		readonly blockFrames: number
		readonly channels: 2
		readonly sampleRate: number
	}
	readonly 'start-audio': EmptyPayload
	readonly 'stop-audio': EmptyPayload
	readonly 'load-render-plan': { readonly plan: EngineWireRenderPlan }
	readonly 'apply-render-plan-delta': {
		readonly baseRevision: number
		readonly changes: readonly EngineRenderPlanDeltaChange[]
		readonly targetRevision: number
	}
	readonly play: { readonly startTick: number }
	readonly stop: EmptyPayload
	readonly seek: { readonly tick: number }
	readonly 'set-loop': {
		readonly enabled: boolean
		readonly endTick: number
		readonly startTick: number
	}
	readonly 'set-metronome-enabled': { readonly enabled: boolean }
	readonly 'set-metronome-volume': { readonly volume: number }
	readonly 'note-on': {
		readonly auditionId: string
		readonly layerId: string
		readonly pitch: number
		readonly velocity: number
	}
	readonly 'note-off': { readonly auditionId: string }
	readonly 'start-preview': {
		readonly events: readonly EnginePreviewEvent[]
		readonly layerId: string
		readonly previewId: string
		readonly programVersion: 1
	}
	readonly 'cancel-preview': { readonly previewId: string }
	readonly 'preview-macro': {
		readonly baseRevision: number
		readonly layerId: string
		readonly macro: 'brightness' | 'dirt' | 'hardness' | 'length' | 'width'
		readonly value: number
	}
	readonly 'commit-macro': EngineCommandPayloadByType['preview-macro']
	readonly 'request-diagnostics': EmptyPayload
	readonly 'refresh-devices': EmptyPayload
	readonly 'start-offline-render': {
		readonly blockFrames: number
		readonly endTick: number
		readonly plan: EngineWireRenderPlan
		readonly renderId: string
		readonly sampleRate: number
	}
	readonly 'cancel-offline-render': { readonly renderId: string }
	readonly shutdown: EmptyPayload
	readonly ping: { readonly heartbeatId: string }
}

export type EngineCommandEnvelope<Type extends EngineCommandType = EngineCommandType> = Readonly<{
	payload: EngineCommandPayloadByType[Type]
	protocolVersion: number
	requestId: string
	sequence: number
	type: Type
}>

export type AnyEngineCommandEnvelope = {
	readonly [Type in EngineCommandType]: EngineCommandEnvelope<Type>
}[EngineCommandType]

export interface EngineEventPayloadByType {
	readonly ready: { readonly protocolVersion: number }
	readonly capabilities: {
		readonly capabilities: readonly EngineCapabilityCode[]
		readonly limits: typeof engineProtocolLimits
	}
	readonly 'render-plan-acknowledged': {
		readonly planGeneration: number
		readonly projectRevision: number
	}
	readonly 'transport-snapshot': {
		readonly playing: boolean
		readonly projectRevision: number
		readonly samplePosition: number
		readonly tick: number
	}
	readonly 'meter-snapshot': { readonly leftPeak: number; readonly rightPeak: number }
	readonly 'preview-started': {
		readonly durationFrames: number
		readonly previewId: string
	}
	readonly 'preview-state': {
		readonly active: boolean
		readonly pitches: readonly number[]
		readonly previewId: string
		readonly samplePosition: number
	}
	readonly 'preview-ended': {
		readonly previewId: string
		readonly reason: 'completed' | 'canceled' | 'interrupted'
	}
	readonly 'audio-devices-changed': {
		readonly devices: readonly {
			readonly default: boolean
			readonly id: string
			readonly label: string
		}[]
	}
	readonly 'active-device-changed': { readonly deviceId: string | null }
	readonly 'midi-captured': {
		readonly pitch: number
		readonly samplePosition: number
		readonly velocity: number
	}
	readonly diagnostic: {
		readonly code: EngineDiagnosticCode
		readonly message: string
		readonly projectRevision: number | null
	}
	readonly 'offline-render-progress': {
		readonly completedFrames: number
		readonly renderId: string
		readonly totalFrames: number
	}
	readonly 'offline-render-completed': {
		readonly frameCount: number
		readonly projectRevision: number
		readonly renderId: string
	}
	readonly 'fatal-error': { readonly code: EngineDiagnosticCode; readonly message: string }
	readonly pong: { readonly heartbeatId: string }
	readonly 'audio-health': {
		readonly activeDeviceId: string | null
		readonly activeVoices: number
		readonly backendState: 'starting' | 'ready' | 'stopped' | 'failed'
		readonly blockFrames: number | null
		readonly deviceState: 'available' | 'unavailable' | 'lost'
		readonly mode: 'shared' | 'browser' | null
		readonly outputMuted: boolean
		readonly outputSignalObserved: boolean
		readonly projectRevision: number | null
		readonly sampleRate: number | null
		readonly underruns: number
	}
}

export type EngineEventEnvelope<Type extends EngineEventType = EngineEventType> = Readonly<{
	payload: EngineEventPayloadByType[Type]
	protocolVersion: number
	sequence: number
	type: Type
}>

export type AnyEngineEventEnvelope = {
	readonly [Type in EngineEventType]: EngineEventEnvelope<Type>
}[EngineEventType]

export interface EngineProtocolFailure {
	readonly diagnostic: EngineDiagnosticCode
	readonly message: string
	readonly ok: false
}

export type EngineProtocolResult<Value> =
	{ readonly ok: true; readonly value: Value } | EngineProtocolFailure
