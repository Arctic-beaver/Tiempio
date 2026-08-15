import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { performanceMapping } from '../../../music-theory/src/index.js'
import {
	classifyPerformanceFocusTarget,
	keyboardPerformanceSource,
	midiPerformanceSource,
	performanceKeyDown,
	performanceKeyUp,
	performancePointerCaptureLost,
	performancePointerDown,
	performancePointerEnd,
	performancePointerVelocity,
	type PerformanceKeyboardEvent,
	type PerformancePointerEvent,
	type PerformancePointerCaptureTarget
} from './performance-input-events.js'
import {
	performanceSourceId,
	PerformanceInputSession,
	type PerformanceVoiceSink
} from './performance-input-session.js'

interface SinkEvent {
	readonly auditionId: string
	readonly layerId?: string
	readonly sourceId?: string
	readonly sourceKind?: string
	readonly sourceTimestamp?: number | null
	readonly pitch?: number
	readonly type: 'off' | 'on'
	readonly velocity?: number
}

function testSession(): {
	readonly events: SinkEvent[]
	readonly session: PerformanceInputSession
} {
	const events: SinkEvent[] = []
	const sink: PerformanceVoiceSink = {
		input: (event) =>
			events.push({
				auditionId: event.auditionId,
				layerId: event.layerId,
				pitch: event.pitch,
				sourceId: event.sourceId,
				sourceKind: event.sourceKind,
				sourceTimestamp: event.sourceTimestamp,
				type: event.phase === 'note-on' ? 'on' : 'off',
				velocity: event.velocity
			})
	}
	return { events, session: new PerformanceInputSession(sink) }
}

const aMinor = performanceMapping(
	{ tonic: 9, mode: 'minor' },
	{ layout: 'compact', rotation: 0, tonicMidi: 45 }
)

describe('performance input session', () => {
	it('classifies semantic focus targets and fails closed for unknown inputs', () => {
		const target = (
			tagName: string,
			attributes: Readonly<Record<string, string>> = {},
			insideModal = false
		): EventTarget =>
			({
				tagName,
				getAttribute: (name: string) => attributes[name] ?? null,
				closest: (selector: string) =>
					insideModal && selector.includes('dialog') ? { role: 'dialog' } : null
			}) as unknown as EventTarget

		assert.equal(
			classifyPerformanceFocusTarget(target('INPUT', { type: 'range' })),
			'range-adjustment'
		)
		assert.equal(
			classifyPerformanceFocusTarget(target('INPUT', { type: 'text' })),
			'text-editing'
		)
		assert.equal(
			classifyPerformanceFocusTarget(target('INPUT', { type: 'future-editor' })),
			'text-editing'
		)
		assert.equal(
			classifyPerformanceFocusTarget(target('DIV', { role: 'combobox' })),
			'text-editing'
		)
		assert.equal(
			classifyPerformanceFocusTarget(target('DIV', { contenteditable: 'true' })),
			'text-editing'
		)
		assert.equal(classifyPerformanceFocusTarget(target('BUTTON')), 'action-control')
		assert.equal(classifyPerformanceFocusTarget(target('BUTTON', {}, true)), 'modal-or-capture')
		assert.equal(
			classifyPerformanceFocusTarget({
				tagName: 'BUTTON',
				closest: (selector: string) =>
					selector.includes('dialog') || selector.includes('routing="allow"') ? {} : null
			} as unknown as EventTarget),
			'action-control'
		)
		assert.equal(classifyPerformanceFocusTarget(null), 'performance-surface')
	})

	it('source-counts physical and pointer holds without an early note-off', () => {
		const { events, session } = testSession()
		session.activate('sound-chooser', 'layer.bass', aMinor)
		const keyboard = performanceSourceId('keyboard', 'KeyA')
		const pointer = performanceSourceId('pointer', 17)
		assert.equal(session.pressCode('sound-chooser', keyboard, 'KeyA'), true)
		assert.equal(session.pressCode('sound-chooser', pointer, 'KeyA'), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [
			{ code: 'KeyA', pitch: 45, sourceCount: 2 }
		])
		assert.equal(session.releaseSource(pointer), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [
			{ code: 'KeyA', pitch: 45, sourceCount: 1 }
		])
		assert.equal(events.filter(({ type }) => type === 'off').length, 1)
		assert.equal(session.releaseSource(keyboard), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [])
		assert.equal(events.filter(({ type }) => type === 'off').length, 2)
	})

	it('releases every source before remap, deactivation and owner transfer', () => {
		const { events, session } = testSession()
		session.activate('palette', 'layer.bass', aMinor)
		session.pressCode('palette', performanceSourceId('keyboard', 'KeyA'), 'KeyA')
		const rotated = performanceMapping(
			{ tonic: 9, mode: 'minor' },
			{ layout: 'compact', rotation: 2, tonicMidi: 45 }
		)
		assert.equal(session.remap('palette', 'layer.bass', rotated), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [])
		assert.equal(events.at(-1)?.type, 'off')
		session.pressCode('palette', performanceSourceId('keyboard', 'KeyD'), 'KeyD')
		session.activate('play-drawer', 'layer.melody', aMinor)
		assert.equal(session.getSnapshot().ownerId, 'play-drawer')
		assert.deepEqual(session.getSnapshot().heldKeys, [])
		assert.equal(session.deactivate('palette'), false)
		assert.equal(session.deactivate('play-drawer'), true)
	})

	it('keeps an automatic preview source bounded and outside mapped key ownership', () => {
		const { session } = testSession()
		session.activate('palette', 'layer.bass', aMinor)
		const preview = performanceSourceId('preview', 'palette-step-1')
		assert.equal(session.pressPitch('palette', preview, 81, null, 90), true)
		assert.equal(session.pressPitch('palette', preview, 83), false)
		assert.deepEqual(session.getSnapshot().heldKeys, [
			{ code: null, pitch: 81, sourceCount: 1 }
		])
		assert.equal(session.releaseAll(), true)
		assert.equal(session.releaseAll(), false)
	})

	it('exposes a bounded MIDI-ready source without pairing simultaneous notes by pitch', () => {
		const { events, session } = testSession()
		session.activate('editor', 'layer.bass', aMinor)
		const first = midiPerformanceSource('device-1', 2, 60)
		const second = midiPerformanceSource('device-1', 3, 60)
		assert.equal(session.pressPitch('editor', first, 60, null, 88, 12.5), true)
		assert.equal(session.pressPitch('editor', second, 60, null, 91, 13), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [
			{ code: null, pitch: 60, sourceCount: 2 }
		])
		assert.equal(events[0]?.sourceKind, 'midi')
		assert.equal(events[0]?.sourceTimestamp, 12.5)
		assert.equal(events[0]?.velocity, 88)
		assert.equal(session.releaseSource(first, 20), true)
		assert.equal(session.getSnapshot().heldKeys[0]?.sourceCount, 1)
		assert.equal(events.at(-1)?.sourceTimestamp, 20)
		assert.equal(session.releaseSource(second), true)
	})
})

describe('performance input events', () => {
	it('uses physical codes across labels and ignores repeats, modifiers and editing fields', () => {
		const { events, session } = testSession()
		session.activate('surface', 'layer.bass', aMinor)
		let prevented = 0
		const key = (overrides: Record<string, unknown> = {}): PerformanceKeyboardEvent =>
			({
				code: 'KeyA',
				altKey: false,
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				repeat: false,
				isComposing: false,
				target: null,
				timeStamp: 16,
				preventDefault: () => (prevented += 1),
				...overrides
			}) as PerformanceKeyboardEvent
		assert.equal(performanceKeyDown(session, 'surface', key({ key: 'ф' })), true)
		assert.equal(events.at(-1)?.pitch, 45)
		assert.equal(events.at(-1)?.sourceKind, 'keyboard')
		assert.equal(events.at(-1)?.sourceTimestamp, 16)
		assert.equal(performanceKeyUp(session, key({ key: 'a' })), true)
		for (const blocked of [
			key({ repeat: true }),
			key({ ctrlKey: true }),
			key({ altKey: true }),
			key({ metaKey: true }),
			key({ shiftKey: true }),
			key({ isComposing: true }),
			key({ target: { tagName: 'INPUT' } }),
			key({
				target: {
					closest: (selector: string) =>
						selector.includes('dialog') ? { role: 'dialog' } : null,
					tagName: 'BUTTON'
				}
			})
		]) {
			assert.equal(performanceKeyDown(session, 'surface', blocked), false)
		}
		assert.equal(prevented, 2)
		assert.equal(session.releaseSource(keyboardPerformanceSource('KeyA')), false)
	})

	it('routes mapped physical codes through ranges and releases by note-on ownership', () => {
		const { events, session } = testSession()
		session.activate('surface', 'layer.bass', aMinor)
		let prevented = 0
		const range = {
			tagName: 'INPUT',
			type: 'range',
			closest: () => null
		} as unknown as EventTarget
		const key = (code: string, target: EventTarget | null): PerformanceKeyboardEvent => ({
			code,
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			repeat: false,
			isComposing: false,
			target,
			timeStamp: 24,
			preventDefault: () => (prevented += 1)
		})

		assert.equal(performanceKeyDown(session, 'surface', key('KeyA', range)), true)
		assert.equal(performanceKeyDown(session, 'surface', key('ArrowRight', range)), false)
		assert.deepEqual(
			session.getSnapshot().heldKeys.map(({ code }) => code),
			['KeyA']
		)
		assert.equal(performanceKeyUp(session, key('KeyA', null)), true)
		assert.deepEqual(
			events.map(({ type }) => type),
			['on', 'off']
		)
		assert.equal(prevented, 2)
	})

	it('captures independent touches, rejects secondary mouse and releases cancel paths', () => {
		const { events, session } = testSession()
		session.activate('surface', 'layer.bass', aMinor)
		const captures = new Set<number>()
		const target: PerformancePointerCaptureTarget = {
			hasPointerCapture: (pointerId) => captures.has(pointerId),
			setPointerCapture: (pointerId) => captures.add(pointerId),
			releasePointerCapture: (pointerId) => captures.delete(pointerId)
		}
		const pointer = (
			pointerId: number,
			pointerType: string,
			button = 0,
			pressure = 0.5,
			isPrimary = pointerId === 1
		): PerformancePointerEvent => ({
			pointerId,
			pointerType,
			button,
			isPrimary,
			pressure,
			timeStamp: pointerId * 10,
			currentTarget: target,
			preventDefault: () => undefined
		})
		assert.equal(
			performancePointerDown(session, 'surface', 'KeyA', pointer(1, 'touch', 0, 0.25)),
			true
		)
		assert.equal(events.at(-1)?.velocity, 64)
		assert.equal(events.at(-1)?.sourceKind, 'pointer')
		assert.equal(events.at(-1)?.sourceTimestamp, 10)
		assert.equal(performancePointerDown(session, 'surface', 'KeyS', pointer(1, 'touch')), false)
		assert.equal(session.getSnapshot().heldKeys[0]?.code, 'KeyA')
		assert.equal(
			performancePointerDown(session, 'surface', 'KeyD', pointer(2, 'touch', 0, 1)),
			true
		)
		assert.equal(events.at(-1)?.velocity, 127)
		assert.equal(session.getSnapshot().heldKeys.length, 2)
		assert.equal(
			performancePointerDown(session, 'surface', 'KeyF', pointer(3, 'mouse', 1)),
			false
		)
		assert.equal(performancePointerVelocity('touch', 0.25), 64)
		assert.equal(performancePointerVelocity('pen', 1), 127)
		assert.equal(performancePointerVelocity('mouse', 1), 102)
		assert.equal(performancePointerEnd(session, pointer(1, 'touch')), true)
		assert.equal(performancePointerCaptureLost(session, 2), true)
		assert.deepEqual(session.getSnapshot().heldKeys, [])
	})
})
