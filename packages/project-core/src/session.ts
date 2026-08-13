import {
	reduceProjectCommand,
	type ProjectCommand,
	type ProjectCommandFailure,
	type ProjectCommandFailureCode
} from './commands.js'
import { type ProjectDocument } from './model.js'
import { assertValidProject } from './validation.js'

export const defaultProjectHistoryCapacity = 50 as const
export const maximumProjectHistoryCapacity = 200 as const

export type ProjectSessionErrorCode =
	| ProjectCommandFailureCode
	| 'HISTORY_EMPTY'
	| 'INVALID_ACKNOWLEDGEMENT'
	| 'INVALID_FINGERPRINT'
	| 'REVISION_EXHAUSTED'
	| 'SAVE_IN_PROGRESS'
	| 'RECOVERY_IN_PROGRESS'

export class ProjectSessionError extends Error {
	public readonly code: ProjectSessionErrorCode

	public constructor(code: ProjectSessionErrorCode, message: string) {
		super(message)
		this.name = 'ProjectSessionError'
		this.code = code
	}
}

export interface RevisionOperation {
	readonly fingerprint: string
	readonly revision: number
}

export interface ProjectSessionSnapshot {
	readonly canRedo: boolean
	readonly canUndo: boolean
	readonly dirty: boolean
	readonly historyCapacity: number
	readonly persistedRevision: number
	readonly project: ProjectDocument
	readonly recovery: {
		readonly inFlight: RevisionOperation | null
		readonly needed: boolean
		readonly protectedRevision: number
	}
	readonly revision: number
	readonly save: {
		readonly inFlight: RevisionOperation | null
	}
}

export interface ProjectDispatchOptions {
	readonly historyGroup?: string
}

declare const preparedProjectTransactionBrand: unique symbol

export interface PreparedProjectTransaction {
	readonly baseRevision: number
	readonly project: ProjectDocument
	readonly revision: number
	readonly [preparedProjectTransactionBrand]: true
}

interface OwnedPreparedProjectTransaction extends PreparedProjectTransaction {
	readonly baseProject: ProjectDocument
}

function freezeOperation(operation: RevisionOperation | null): RevisionOperation | null {
	return operation === null ? null : Object.freeze({ ...operation })
}

function freezeSnapshot(snapshot: ProjectSessionSnapshot): ProjectSessionSnapshot {
	return Object.freeze({
		...snapshot,
		recovery: Object.freeze({
			...snapshot.recovery,
			inFlight: freezeOperation(snapshot.recovery.inFlight)
		}),
		save: Object.freeze({
			...snapshot.save,
			inFlight: freezeOperation(snapshot.save.inFlight)
		})
	})
}

function sessionError(code: ProjectSessionErrorCode, message: string): ProjectSessionError {
	return new ProjectSessionError(code, message)
}

function validateFingerprint(value: string): void {
	if (value.length === 0 || value.length > 512) {
		throw sessionError(
			'INVALID_FINGERPRINT',
			'A persistence fingerprint must contain 1-512 characters.'
		)
	}
}

function validateRevision(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw sessionError('STALE_REVISION', 'A revision must be a non-negative safe integer.')
	}
}

export class ProjectSession {
	readonly #historyCapacity: number
	readonly #listeners = new Set<() => void>()
	readonly #preparedTransactions = new WeakSet<object>()
	readonly #undoHistory: ProjectDocument[] = []
	readonly #redoHistory: ProjectDocument[] = []
	#activeHistoryGroup: string | null = null
	#snapshot: ProjectSessionSnapshot

	public constructor(
		project: ProjectDocument,
		options: { readonly historyCapacity?: number } = {}
	) {
		const historyCapacity = options.historyCapacity ?? defaultProjectHistoryCapacity
		if (
			!Number.isSafeInteger(historyCapacity) ||
			historyCapacity < 1 ||
			historyCapacity > maximumProjectHistoryCapacity
		) {
			throw new RangeError(
				`History capacity must be an integer from 1 to ${String(maximumProjectHistoryCapacity)}.`
			)
		}
		this.#historyCapacity = historyCapacity
		this.#snapshot = freezeSnapshot({
			project: assertValidProject(project),
			revision: 0,
			persistedRevision: 0,
			dirty: false,
			canUndo: false,
			canRedo: false,
			historyCapacity,
			save: { inFlight: null },
			recovery: { inFlight: null, protectedRevision: 0, needed: false }
		})
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): ProjectSessionSnapshot => this.#snapshot

	public dispatch(
		command: ProjectCommand,
		options: ProjectDispatchOptions = {}
	): ProjectSessionSnapshot {
		const result = reduceProjectCommand(
			this.#snapshot.project,
			this.#snapshot.revision,
			command
		)
		if (result.status === 'rejected') this.#throwFailure(result.failure)
		if (result.status === 'noop') return this.#snapshot
		this.#requireRevisionCapacity()
		const historyGroup = options.historyGroup ?? null
		if (historyGroup === null || historyGroup !== this.#activeHistoryGroup) {
			this.#pushBounded(this.#undoHistory, this.#snapshot.project)
			this.#redoHistory.length = 0
		}
		this.#activeHistoryGroup = historyGroup
		this.#publishContent(result.project)
		return this.#snapshot
	}

	public prepareTransaction(commands: readonly ProjectCommand[]): PreparedProjectTransaction {
		if (commands.length === 0) {
			throw sessionError('INVALID_COMMAND', 'A project transaction cannot be empty.')
		}
		let project = this.#snapshot.project
		let revision = this.#snapshot.revision
		for (const command of commands) {
			const result = reduceProjectCommand(project, revision, command)
			if (result.status === 'rejected') this.#throwFailure(result.failure)
			if (result.status === 'noop') continue
			if (revision >= Number.MAX_SAFE_INTEGER) {
				throw sessionError(
					'REVISION_EXHAUSTED',
					'The project revision counter is exhausted.'
				)
			}
			project = result.project
			revision += 1
		}
		if (project === this.#snapshot.project) {
			throw sessionError('INVALID_COMMAND', 'A project transaction must change the project.')
		}
		const prepared = Object.freeze({
			baseRevision: this.#snapshot.revision,
			baseProject: this.#snapshot.project,
			project,
			revision
		}) as OwnedPreparedProjectTransaction
		this.#preparedTransactions.add(prepared)
		return prepared
	}

	public commitTransaction(prepared: PreparedProjectTransaction): ProjectSessionSnapshot {
		const owned = prepared as OwnedPreparedProjectTransaction
		if (!this.#preparedTransactions.delete(owned)) {
			throw sessionError(
				'INVALID_COMMAND',
				'The prepared project transaction is foreign, discarded or already committed.'
			)
		}
		if (
			owned.baseRevision !== this.#snapshot.revision ||
			owned.baseProject !== this.#snapshot.project
		) {
			throw sessionError(
				'STALE_REVISION',
				`Prepared revision ${String(owned.baseRevision)} does not match current revision ${String(this.#snapshot.revision)}.`
			)
		}
		if (owned.revision <= owned.baseRevision || !Number.isSafeInteger(owned.revision)) {
			throw sessionError('INVALID_COMMAND', 'The prepared project transaction is invalid.')
		}
		this.#activeHistoryGroup = null
		this.#pushBounded(this.#undoHistory, this.#snapshot.project)
		this.#redoHistory.length = 0
		this.#publishContentAtRevision(owned.project, owned.revision)
		return this.#snapshot
	}

	public discardTransaction(prepared: PreparedProjectTransaction): boolean {
		return this.#preparedTransactions.delete(prepared)
	}

	public endHistoryGroup(historyGroup: string): void {
		if (this.#activeHistoryGroup === historyGroup) this.#activeHistoryGroup = null
	}

	public undo(baseRevision: number): ProjectSessionSnapshot {
		this.#activeHistoryGroup = null
		this.#requireCurrentRevision(baseRevision)
		this.#requireRevisionCapacity()
		const project = this.#undoHistory.pop()
		if (project === undefined)
			throw sessionError('HISTORY_EMPTY', 'There is no project command to undo.')
		this.#pushBounded(this.#redoHistory, this.#snapshot.project)
		this.#publishContent(project)
		return this.#snapshot
	}

	public redo(baseRevision: number): ProjectSessionSnapshot {
		this.#activeHistoryGroup = null
		this.#requireCurrentRevision(baseRevision)
		this.#requireRevisionCapacity()
		const project = this.#redoHistory.pop()
		if (project === undefined)
			throw sessionError('HISTORY_EMPTY', 'There is no project command to redo.')
		this.#pushBounded(this.#undoHistory, this.#snapshot.project)
		this.#publishContent(project)
		return this.#snapshot
	}

	public beginSave(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireCurrentRevision(revision)
		validateFingerprint(fingerprint)
		const current = this.#snapshot.save.inFlight
		if (current !== null) {
			if (current.revision === revision && current.fingerprint === fingerprint)
				return this.#snapshot
			throw sessionError('SAVE_IN_PROGRESS', 'Another project snapshot is already saving.')
		}
		this.#publish({
			...this.#snapshot,
			save: { inFlight: { revision, fingerprint } }
		})
		return this.#snapshot
	}

	public acknowledgeSave(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireAcknowledgement(this.#snapshot.save.inFlight, revision, fingerprint, 'save')
		this.#publish({
			...this.#snapshot,
			persistedRevision: revision,
			dirty: revision !== this.#snapshot.revision,
			save: { inFlight: null }
		})
		return this.#snapshot
	}

	public cancelSave(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireAcknowledgement(this.#snapshot.save.inFlight, revision, fingerprint, 'save')
		this.#publish({ ...this.#snapshot, save: { inFlight: null } })
		return this.#snapshot
	}

	public beginRecovery(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireCurrentRevision(revision)
		validateFingerprint(fingerprint)
		const current = this.#snapshot.recovery.inFlight
		if (current !== null) {
			if (current.revision === revision && current.fingerprint === fingerprint)
				return this.#snapshot
			throw sessionError(
				'RECOVERY_IN_PROGRESS',
				'Another recovery snapshot is already writing.'
			)
		}
		this.#publish({
			...this.#snapshot,
			recovery: { ...this.#snapshot.recovery, inFlight: { revision, fingerprint } }
		})
		return this.#snapshot
	}

	public acknowledgeRecovery(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireAcknowledgement(
			this.#snapshot.recovery.inFlight,
			revision,
			fingerprint,
			'recovery'
		)
		this.#publish({
			...this.#snapshot,
			recovery: {
				inFlight: null,
				protectedRevision: revision,
				needed: revision !== this.#snapshot.revision
			}
		})
		return this.#snapshot
	}

	public cancelRecovery(revision: number, fingerprint: string): ProjectSessionSnapshot {
		this.#requireAcknowledgement(
			this.#snapshot.recovery.inFlight,
			revision,
			fingerprint,
			'recovery'
		)
		this.#publish({
			...this.#snapshot,
			recovery: { ...this.#snapshot.recovery, inFlight: null }
		})
		return this.#snapshot
	}

	#pushBounded(history: ProjectDocument[], project: ProjectDocument): void {
		history.push(project)
		if (history.length > this.#historyCapacity) history.shift()
	}

	#nextRevision(): number {
		this.#requireRevisionCapacity()
		return this.#snapshot.revision + 1
	}

	#requireRevisionCapacity(): void {
		if (this.#snapshot.revision >= Number.MAX_SAFE_INTEGER) {
			throw sessionError('REVISION_EXHAUSTED', 'The project revision counter is exhausted.')
		}
	}

	#publishContent(project: ProjectDocument): void {
		this.#publishContentAtRevision(project, this.#nextRevision())
	}

	#publishContentAtRevision(project: ProjectDocument, revision: number): void {
		this.#publish({
			...this.#snapshot,
			project,
			revision,
			dirty: revision !== this.#snapshot.persistedRevision,
			canUndo: this.#undoHistory.length > 0,
			canRedo: this.#redoHistory.length > 0,
			recovery: {
				...this.#snapshot.recovery,
				needed: revision !== this.#snapshot.recovery.protectedRevision
			}
		})
	}

	#requireCurrentRevision(revision: number): void {
		validateRevision(revision)
		if (revision !== this.#snapshot.revision) {
			throw sessionError(
				'STALE_REVISION',
				`Revision ${String(revision)} does not match current revision ${String(this.#snapshot.revision)}.`
			)
		}
	}

	#requireAcknowledgement(
		operation: RevisionOperation | null,
		revision: number,
		fingerprint: string,
		kind: 'recovery' | 'save'
	): void {
		validateRevision(revision)
		validateFingerprint(fingerprint)
		if (
			operation === null ||
			operation.revision !== revision ||
			operation.fingerprint !== fingerprint ||
			revision > this.#snapshot.revision
		) {
			throw sessionError(
				'INVALID_ACKNOWLEDGEMENT',
				`The ${kind} acknowledgement does not match its in-flight revision and fingerprint.`
			)
		}
	}

	#throwFailure(failure: ProjectCommandFailure): never {
		throw sessionError(failure.code, failure.message)
	}

	#publish(snapshot: ProjectSessionSnapshot): void {
		this.#snapshot = freezeSnapshot(snapshot)
		for (const listener of this.#listeners) listener()
	}
}
