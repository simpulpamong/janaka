export const cloudinaryConfig = {
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? "",
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? "",
}

export const isCloudinaryConfigured =
  !!cloudinaryConfig.cloudName && !!cloudinaryConfig.uploadPreset

export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]

export const ACCEPT_ATTR = [...ACCEPTED_IMAGE_TYPES, "image/*"].join(",")

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_SIZE_MB = MAX_IMAGE_BYTES / (1024 * 1024)

export const FOLDER_UPLOAD = "janaka/bukti-penindakan"

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-"
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
