import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const brandingRoot = resolve(import.meta.dirname, '../resources/branding')
const iconFrames = Object.freeze([
	Object.freeze({ size: 16, type: 'icp4' }),
	Object.freeze({ size: 32, type: 'icp5' }),
	Object.freeze({ size: 64, type: 'icp6' }),
	Object.freeze({ size: 128, type: 'ic07' }),
	Object.freeze({ size: 256, type: 'ic08' }),
	Object.freeze({ size: 512, type: 'ic09' }),
	Object.freeze({ size: 1024, type: 'ic10' })
])

function unsignedInteger(value) {
	const buffer = Buffer.alloc(4)
	buffer.writeUInt32BE(value)
	return buffer
}

function validatePng(buffer, size) {
	const pngSignature = '89504e470d0a1a0a'
	if (
		buffer.subarray(0, 8).toString('hex') !== pngSignature ||
		buffer.readUInt32BE(16) !== size ||
		buffer.readUInt32BE(20) !== size
	) {
		throw new Error(`Expected a ${String(size)}x${String(size)} PNG icon frame.`)
	}
}

const chunks = []
for (const frame of iconFrames) {
	const png = await readFile(
		resolve(brandingRoot, 'linux', `${String(frame.size)}x${String(frame.size)}.png`)
	)
	validatePng(png, frame.size)
	chunks.push(
		Buffer.concat([Buffer.from(frame.type, 'ascii'), unsignedInteger(png.length + 8), png])
	)
}

const body = Buffer.concat(chunks)
await writeFile(
	resolve(brandingRoot, 'tiempio.icns'),
	Buffer.concat([Buffer.from('icns', 'ascii'), unsignedInteger(body.length + 8), body])
)
