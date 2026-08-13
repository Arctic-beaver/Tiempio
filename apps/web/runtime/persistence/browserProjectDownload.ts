export function downloadProjectFile(
	bytes: Uint8Array,
	suggestedName: string,
	documentTarget: Document = document,
	objectUrls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL
): void {
	const owned = new Uint8Array(bytes)
	const url = objectUrls.createObjectURL(
		new Blob([owned], { type: 'application/vnd.tiempio.project+zip' })
	)
	const anchor = documentTarget.createElement('a')
	anchor.download = suggestedName
	anchor.href = url
	anchor.hidden = true
	documentTarget.body.append(anchor)
	try {
		anchor.click()
	} finally {
		anchor.remove()
		globalThis.setTimeout(() => objectUrls.revokeObjectURL(url), 0)
	}
}
