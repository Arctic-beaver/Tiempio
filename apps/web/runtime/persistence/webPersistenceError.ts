import {
	applicationError,
	type ApplicationError,
	type ApplicationErrorCode
} from '../../../../packages/contracts/src/index.js'

export class WebPersistenceError extends Error {
	public constructor(
		readonly code: ApplicationErrorCode,
		message: string,
		readonly retryable = false
	) {
		super(message)
		this.name = 'WebPersistenceError'
	}
}

function errorName(error: unknown): string | null {
	return typeof error === 'object' && error !== null && 'name' in error
		? String((error as { readonly name: unknown }).name)
		: null
}

export function webPersistenceApplicationError(error: unknown): ApplicationError {
	if (error instanceof WebPersistenceError) {
		return applicationError(error.code, error.message, { retryable: error.retryable })
	}
	if (errorName(error) === 'QuotaExceededError') {
		return applicationError('STORAGE_QUOTA_EXCEEDED', 'Browser storage quota was exceeded.', {
			retryable: true
		})
	}
	return applicationError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.', {
		retryable: true
	})
}
