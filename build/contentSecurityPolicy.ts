import type { Plugin } from 'vite'

export type ProductionTarget = 'desktop' | 'web'

export const contentSecurityPolicyMarkers = Object.freeze({
	desktop: '__TIEMPIO_DESKTOP_CONTENT_SECURITY_POLICY__',
	web: '__TIEMPIO_WEB_CONTENT_SECURITY_POLICY__'
})

export function contentSecurityPolicy(target: ProductionTarget, development = false): string {
	const directives = [
		"default-src 'self'",
		"script-src 'self'",
		development ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
		"img-src 'self' data:",
		"font-src 'self'",
		development ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*" : "connect-src 'none'",
		"worker-src 'self' blob:",
		"media-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"form-action 'none'"
	]
	if (target === 'desktop') directives.push("navigate-to 'none'")
	return directives.join('; ')
}

export function contentSecurityPolicyPlugin(
	target: ProductionTarget,
	development: boolean
): Plugin {
	const marker = contentSecurityPolicyMarkers[target]
	return {
		name: `tiempio-${target}-content-security-policy`,
		transformIndexHtml(html) {
			if (!html.includes(marker)) {
				throw new Error(`${target} HTML is missing the Tiempio CSP marker.`)
			}
			return html.replace(marker, contentSecurityPolicy(target, development))
		}
	}
}
