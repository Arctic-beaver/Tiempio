import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLayer, createProject, loadProjectDocument, patchModelVersion } from './index.js'

describe('project loading', () => {
	it('loads the current project schema', () => {
		const project = createProject({ projectId: 'project.current', title: 'Current' })
		const result = loadProjectDocument(project)
		assert.equal(result.status, 'loaded')
		if (result.status === 'loaded') assert.deepEqual(result.project, project)
	})

	it('rejects every non-current schema as invalid data', () => {
		const result = loadProjectDocument({ schemaVersion: Number.MAX_SAFE_INTEGER })
		assert.equal(result.status, 'invalid')
		if (result.status === 'invalid') assert.equal(result.issues[0]?.path, '$.schemaVersion')
	})

	it('rejects every non-current resolved patch model as invalid data', () => {
		const project = createProject({
			projectId: 'project.patch-version',
			title: 'Patch version'
		})
		const layer = createLayer({ id: 'layer.bass', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const nonCurrentVersion = patchModelVersion + 1
		const nonCurrentLayer = {
			...layer,
			source: {
				...layer.source,
				instrument: {
					...layer.source.instrument,
					resolvedPatch: {
						...layer.source.instrument.resolvedPatch,
						patchModelVersion: nonCurrentVersion
					}
				}
			}
		}
		const result = loadProjectDocument({ ...project, layers: [nonCurrentLayer] })
		assert.equal(result.status, 'invalid')
		if (result.status === 'invalid') {
			assert.ok(
				result.issues.some(({ path }) => path.endsWith('.resolvedPatch.patchModelVersion'))
			)
		}
	})

	it('rejects malformed schema markers as invalid data', () => {
		const result = loadProjectDocument({ schemaVersion: '4' })
		assert.equal(result.status, 'invalid')
		if (result.status === 'invalid') {
			assert.equal(result.issues[0]?.path, '$.schemaVersion')
		}
	})
})
