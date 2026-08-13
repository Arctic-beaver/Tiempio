import { WebPersistenceError } from './WebIndexedDbRuntime.js'

export interface WebProjectFile {
	readonly size: number
	arrayBuffer(): Promise<ArrayBuffer>
}

export interface WebProjectWritable {
	abort?(): Promise<void>
	close(): Promise<void>
	write(bytes: Uint8Array): Promise<void>
}

export type WebProjectPermissionState = 'denied' | 'granted' | 'prompt'

export interface WebProjectFileHandle {
	createWritable(options?: { readonly keepExistingData?: boolean }): Promise<WebProjectWritable>
	getFile(): Promise<WebProjectFile>
	isSameEntry?(other: WebProjectFileHandle): Promise<boolean>
	queryPermission(options: { readonly mode: 'readwrite' }): Promise<WebProjectPermissionState>
}

export interface WebProjectOpenSelection {
	readonly file: WebProjectFile
	readonly handle: WebProjectFileHandle | null
}

export type WebProjectSaveSelection =
	| { readonly status: 'canceled' }
	| { readonly status: 'unavailable' }
	| { readonly handle: WebProjectFileHandle; readonly status: 'selected' }

export interface WebProjectFilePort {
	download(bytes: Uint8Array, suggestedName: string): void
	open(): Promise<WebProjectOpenSelection | null>
	save(suggestedName: string): Promise<WebProjectSaveSelection>
}

interface FilePickerType {
	readonly accept: Readonly<Record<string, readonly string[]>>
	readonly description: string
}

interface WebFilePickerWindow {
	showOpenFilePicker?(options: {
		readonly excludeAcceptAllOption: boolean
		readonly multiple: false
		readonly types: readonly FilePickerType[]
	}): Promise<readonly WebProjectFileHandle[]>
	showSaveFilePicker?(options: {
		readonly excludeAcceptAllOption: boolean
		readonly suggestedName: string
		readonly types: readonly FilePickerType[]
	}): Promise<WebProjectFileHandle>
}

const projectFileTypes = Object.freeze([
	Object.freeze({
		description: 'Tiempio project',
		accept: Object.freeze({ 'application/zip': Object.freeze(['.tiempio']) })
	})
])

function isCanceled(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		String((error as { readonly name: unknown }).name) === 'AbortError'
	)
}

function pickerFailure(error: unknown): WebPersistenceError {
	const denied =
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		String((error as { readonly name: unknown }).name) === 'NotAllowedError'
	return new WebPersistenceError(
		denied ? 'PERMISSION_DENIED' : 'STORAGE_UNAVAILABLE',
		denied
			? 'The browser denied access to the selected project.'
			: 'The browser file picker is unavailable.',
		!denied
	)
}

export class BrowserProjectFilePort implements WebProjectFilePort {
	public constructor(
		private readonly pickerWindow: WebFilePickerWindow = window as unknown as WebFilePickerWindow,
		private readonly documentTarget: Document = document,
		private readonly objectUrls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL
	) {}

	#openWithInput(): Promise<WebProjectOpenSelection | null> {
		return new Promise<WebProjectOpenSelection | null>((resolve) => {
			const input = this.documentTarget.createElement('input')
			input.type = 'file'
			input.accept = '.tiempio,application/zip'
			input.hidden = true
			let settled = false
			const finish = (selection: WebProjectOpenSelection | null): void => {
				if (settled) return
				settled = true
				input.removeEventListener('change', changed)
				input.removeEventListener('cancel', canceled)
				input.remove()
				resolve(selection)
			}
			const changed = (): void => {
				const file = input.files?.item(0) ?? null
				finish(file === null ? null : Object.freeze({ file, handle: null }))
			}
			const canceled = (): void => finish(null)
			input.addEventListener('change', changed)
			input.addEventListener('cancel', canceled)
			this.documentTarget.body.append(input)
			input.click()
		})
	}

	public async open(): Promise<WebProjectOpenSelection | null> {
		if (this.pickerWindow.showOpenFilePicker === undefined) return await this.#openWithInput()
		try {
			const [handle] = await this.pickerWindow.showOpenFilePicker({
				excludeAcceptAllOption: true,
				multiple: false,
				types: projectFileTypes
			})
			if (handle === undefined) return null
			return Object.freeze({ handle, file: await handle.getFile() })
		} catch (error) {
			if (isCanceled(error)) return null
			throw pickerFailure(error)
		}
	}

	public async save(suggestedName: string): Promise<WebProjectSaveSelection> {
		if (this.pickerWindow.showSaveFilePicker === undefined) {
			return Object.freeze({ status: 'unavailable' as const })
		}
		try {
			const handle = await this.pickerWindow.showSaveFilePicker({
				excludeAcceptAllOption: true,
				suggestedName,
				types: projectFileTypes
			})
			return Object.freeze({ status: 'selected' as const, handle })
		} catch (error) {
			if (isCanceled(error)) return Object.freeze({ status: 'canceled' as const })
			throw pickerFailure(error)
		}
	}

	public download(bytes: Uint8Array, suggestedName: string): void {
		const owned = new Uint8Array(bytes)
		const url = this.objectUrls.createObjectURL(
			new Blob([owned], { type: 'application/vnd.tiempio.project+zip' })
		)
		const anchor = this.documentTarget.createElement('a')
		anchor.download = suggestedName
		anchor.href = url
		anchor.hidden = true
		this.documentTarget.body.append(anchor)
		try {
			anchor.click()
		} finally {
			anchor.remove()
			globalThis.setTimeout(() => this.objectUrls.revokeObjectURL(url), 0)
		}
	}
}
