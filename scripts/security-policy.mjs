import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const expectedDirectives = Object.freeze([
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self'",
	"connect-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"frame-ancestors 'none'",
	"form-action 'none'"
])

export function validateProductionHtml(html, target) {
	const errors = []
	if (!/http-equiv=["']Content-Security-Policy["']/iu.test(html)) {
		errors.push(`${target} output has no CSP meta element`)
	}
	for (const directive of expectedDirectives) {
		if (!html.includes(directive)) errors.push(`${target} CSP is missing ${directive}`)
	}
	for (const forbidden of [
		'__TIEMPIO_DESKTOP_CONTENT_SECURITY_POLICY__',
		'__TIEMPIO_WEB_CONTENT_SECURITY_POLICY__',
		"'unsafe-eval'",
		"'unsafe-inline'"
	]) {
		if (html.includes(forbidden)) errors.push(`${target} production HTML contains ${forbidden}`)
	}
	return errors
}

export function validateSecuritySources({
	desktopHtml,
	webHtml,
	buildSource,
	desktopConfig,
	webConfig
}) {
	const errors = []
	if (!desktopHtml.includes('__TIEMPIO_DESKTOP_CONTENT_SECURITY_POLICY__')) {
		errors.push('Desktop source HTML is missing its CSP marker')
	}
	if (!webHtml.includes('__TIEMPIO_WEB_CONTENT_SECURITY_POLICY__')) {
		errors.push('Web source HTML is missing its CSP marker')
	}
	for (const token of ["connect-src 'none'", "object-src 'none'", "frame-ancestors 'none'"]) {
		if (!buildSource.includes(token)) errors.push(`CSP source is missing ${token}`)
	}
	if (!desktopConfig.includes("contentSecurityPolicyPlugin('desktop'")) {
		errors.push('Desktop build does not own CSP injection')
	}
	if (!webConfig.includes("contentSecurityPolicyPlugin('web'")) {
		errors.push('Web build does not own CSP injection')
	}
	return errors
}

export function auditSecurityPolicy({
	repositoryRoot = resolve('.'),
	requiredTarget = null,
	report = console.log
} = {}) {
	const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8')
	const errors = validateSecuritySources({
		desktopHtml: read('apps/desktop/renderer/index.html'),
		webHtml: read('apps/web/bootstrap/index.html'),
		buildSource: read('build/contentSecurityPolicy.ts'),
		desktopConfig: read('electron.vite.config.ts'),
		webConfig: read('vite.web.config.ts')
	})
	const builtTargets = {
		desktop: 'dist/desktop/renderer/index.html',
		web: 'dist/web/index.html'
	}
	for (const [target, path] of Object.entries(builtTargets)) {
		const absolutePath = resolve(repositoryRoot, path)
		if (requiredTarget === target && !existsSync(absolutePath)) {
			errors.push(`${target} production HTML is required but missing`)
		} else if (existsSync(absolutePath)) {
			errors.push(...validateProductionHtml(read(path), target))
		}
	}
	if (errors.length > 0) throw new Error(`Security policy failed:\n- ${errors.join('\n- ')}`)
	const message = `PASS production CSP policy${requiredTarget === null ? '' : ` for ${requiredTarget}`}.`
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Production CSP policy')
	const requiredIndex = process.argv.indexOf('--require-build')
	const requiredTarget = requiredIndex === -1 ? null : (process.argv[requiredIndex + 1] ?? null)
	if (requiredTarget !== null && !['desktop', 'web'].includes(requiredTarget)) {
		throw new Error('--require-build must name desktop or web.')
	}
	auditSecurityPolicy({ requiredTarget })
}
