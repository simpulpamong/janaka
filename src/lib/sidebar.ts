/**
 * Preferensi ciut sidebar — satu format nilai yang dipakai AppLayout.
 */

/** Kunci `localStorage` untuk preferensi sidebar. */
export const KUNCI_SIDEBAR_CIUT = "janaka-sidebar-collapsed"

/**
 * Baca preferensi ciut.
 *
 * Mengembalikan `false` (terbuka) bila penyimpanan diblokir — mode privat
 * sebagian peramban melempar, dan itu bukan alasan untuk gagal render.
 * Dipanggil sebagai initializer `useState` supaya nilai yang benar sudah
 * ada sejak **paint pertama**, bukan sesudah efek berjalan.
 */
export function bacaSidebarCiut(): boolean {
  try {
    return localStorage.getItem(KUNCI_SIDEBAR_CIUT) === "1"
  } catch {
    return false
  }
}

/** Simpan preferensi ciut. Gagal menyimpan tidak boleh melempar. */
export function simpanSidebarCiut(ciut: boolean): void {
  try {
    localStorage.setItem(KUNCI_SIDEBAR_CIUT, ciut ? "1" : "0")
  } catch {
    /* Penyimpanan diblokir — preferensi hanya berlaku sampai halaman ditutup. */
  }
}
