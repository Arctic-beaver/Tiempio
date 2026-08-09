import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateProductionHtml, validateSecuritySources } from './security-policy.mjs'

describe('production CSP policy', () => {
	it('accepts strict transformed production HTML', () => {
		const policy = [
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self'",
			"connect-src 'none'",
			"object-src 'none'",
			"base-uri 'none'",
			"frame-ancestors 'none'",
			"form-action 'none'"
		].join('; ')
		assert.deepEqual(
			validateProductionHtml(
				`<meta http-equiv="Content-Security-Policy" content="${policy}">`,
				'web'
			),
			[]
		)
	})

	it('rejects unsafe production style execution', () => {
		assert.match(
			validateProductionHtml(
				'<meta http-equiv="Content-Security-Policy" content="style-src \'unsafe-inline\'">',
				'web'
			).join('\n'),
			/unsafe-inline/u
		)
	})

	it('requires independent Desktop and Web source markers', () => {
		const errors = validateSecuritySources({
			desktopHtml: '<html></html>',
			webHtml: '<html></html>',
			buildSource: '',
			desktopConfig: '',
			webConfig: ''
		})
		assert.ok(errors.length >= 7)
	})
})
