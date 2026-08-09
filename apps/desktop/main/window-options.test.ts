import assert from 'node:assert/strict'
import test from 'node:test'
import { windowChromeOptions } from './window-options.js'

test('Windows and Linux use application-owned window controls', () => {
	assert.deepEqual(windowChromeOptions('win32'), { frame: false })
	assert.deepEqual(windowChromeOptions('linux'), { frame: false })
})

test('macOS preserves native controls with explicit traffic-light spacing', () => {
	assert.deepEqual(windowChromeOptions('darwin'), {
		frame: true,
		titleBarStyle: 'hiddenInset',
		trafficLightPosition: { x: 14, y: 14 }
	})
})
