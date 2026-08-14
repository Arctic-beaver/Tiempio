import { type ProjectDocument } from './model.js'
import { validateProjectDocument, type ProjectValidationIssue } from './validation.js'

export type ProjectLoadResult =
	| {
			readonly project: ProjectDocument
			readonly status: 'loaded'
	  }
	| {
			readonly issues: readonly ProjectValidationIssue[]
			readonly status: 'invalid'
	  }

export function loadProjectDocument(value: unknown): ProjectLoadResult {
	try {
		const result = validateProjectDocument(value)
		return result.ok
			? { status: 'loaded', project: result.project }
			: { status: 'invalid', issues: result.issues }
	} catch (error) {
		return {
			status: 'invalid',
			issues: Object.freeze([
				{
					code: 'TYPE_MISMATCH',
					path: '$',
					message: `Project data could not be inspected: ${error instanceof Error ? error.message : 'unknown error'}`
				}
			])
		}
	}
}
