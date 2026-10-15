/** Endpoint dokumen milik JANAKA yang mengalirkan PDF Sprinter dengan aman. */
const ENDPOINT_DOKUMEN = "/api/janaka/dokumen"

/** Gunakan proxy same-origin untuk SK Sprinter; sumber lain tetap memakai URL aslinya. */
export function urlDokumenProksi(url: string): string {
  if (url.startsWith(ENDPOINT_DOKUMEN)) return url

  const dasar = (import.meta.env.VITE_PTSP_BASE_URL || "https://sprinter.ponorogo.go.id")
    .split(",")[0]!
  let tujuan: URL
  let dasarUrl: URL
  try {
    tujuan = new URL(url, dasar)
    dasarUrl = new URL(dasar)
  } catch {
    return url
  }

  if (
    !["http:", "https:"].includes(tujuan.protocol) ||
    tujuan.hostname !== dasarUrl.hostname ||
    !/^\/v1\/legal\/signed_dokumen(?:\/|$)/.test(tujuan.pathname)
  ) {
    return url
  }

  return `${ENDPOINT_DOKUMEN}?u=${encodeURIComponent(tujuan.href)}`
}