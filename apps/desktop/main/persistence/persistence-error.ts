import {
	applicationError,
	type ApplicationError,
	type ApplicationErrorCode
} from '../../../../packages/contracts/src/index.js'

export class PersistenceBoundaryError extends Error {
	public constructor(
		readonly code: ApplicationErrorCode,
		message: string,
		readonly retryable = false
	) {
		super(message)
		this.name = 'PersistenceBoundaryError'
	}
}

export function persistenceApplicationError(error: unknown): ApplicationError {
	if (error instanceof PersistenceBoundaryError) {
		return applicationError(error.code, error.message, { retryable: error.retryable })
	}
	return applicationError('STORAGE_UNAVAILABLE', 'The storage operation failed.', {
		retryable: true
	})
}
