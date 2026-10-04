// Photos are redrawn before upload: that drops everything hidden in the file
// (camera details and, above all, GPS location), and shrinks big photos.

const OUTPUT: Record<string, string> = {
  'image/png': 'image/png',
  'image/webp': 'image/webp',
}

export class UnreadableImageError extends Error {
  constructor() {
    super('This photo can’t be read here. Try a JPEG or PNG.')
  }
}

/**
 * The photo as a new file, at most `maxSide` pixels on its longest side,
 * with no metadata. GIFs are kept as they are (they carry no location).
 */
export async function cleanImage(file: File, maxSide: number): Promise<File> {
  if (file.type === 'image/gif') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnreadableImageError()
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadableImageError()
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const type = OUTPUT[file.type] ?? 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86))
  if (!blob) throw new UnreadableImageError()
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  const base = file.name.replace(/\.[^.]*$/, '') || 'photo'
  return new File([blob], `${base}.${extension}`, { type })
}
