import {
  CLOUDINARY_UPLOAD_URL,
  MAX_IMAGE_BYTES,
  cloudinaryConfig,
  formatBytes,
  isCloudinaryConfigured,
} from "./config"

export interface CloudinaryUploadResult {
  url: string
  publicId: string
  width: number
  height: number
  bytes: number
  format: string
}

export class CloudinaryUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CloudinaryUploadError"
  }
}

export function validateImageFile(file: File): string | null {
  if (!isCloudinaryConfigured) {
    return "Cloudinary belum dikonfigurasi. Periksa variabel VITE_CLOUDINARY_* pada .env"
  }
  if (!file.type.startsWith("image/")) {
    return `Format berkas tidak didukung: ${file.type || "tidak dikenal"}. Gunakan gambar (JPG/PNG/WebP).`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Ukuran berkas ${formatBytes(file.size)} melebihi batas ${formatBytes(MAX_IMAGE_BYTES)}.`
  }
  return null
}

/**
 * Upload satu berkas gambar ke Cloudinary memakai unsigned preset.
 * Kompresi ringan otomatis (q_auto:good, f_auto) dilakukan Cloudinary.
 */
export async function uploadToCloudinary(
  file: File,
  folder?: string,
): Promise<CloudinaryUploadResult> {
  const validationError = validateImageFile(file)
  if (validationError) throw new CloudinaryUploadError(validationError)

  const body = new FormData()
  body.append("file", file)
  body.append("upload_preset", cloudinaryConfig.uploadPreset)
  if (folder) body.append("folder", folder)

  let response: Response
  try {
    response = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body })
  } catch {
    throw new CloudinaryUploadError("Gagal terhubung ke server Cloudinary")
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload || payload.error) {
    throw new CloudinaryUploadError(
      payload?.error?.message ?? `Upload gagal (HTTP ${response.status})`,
    )
  }

  return {
    url: payload.secure_url,
    publicId: payload.public_id,
    width: payload.width ?? 0,
    height: payload.height ?? 0,
    bytes: payload.bytes ?? file.size,
    format: payload.format ?? "",
  }
}

/** Upload banyak berkas; mengembalikan hasil yang berhasil. */
export async function uploadManyToCloudinary(
  files: File[],
  folder?: string,
): Promise<CloudinaryUploadResult[]> {
  return Promise.all(files.map((f) => uploadToCloudinary(f, folder)))
}
