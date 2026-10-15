/**
 * Entry point Vercel Function untuk manajemen akun (`/api/janaka/*`).
 *
 * Dipisah dari `api/ptsp.ts` supaya hanya fungsi ini yang membawa
 * `firebase-admin` — bukan juga fungsi PTSP yang jauh lebih sering dipanggil.
 *
 * ⚠️ Ekstensi `.js` wajib di impor relatif: output Vercel adalah ESM
 * native (`"type": "module"`), dan ESM menolak impor tanpa ekstensi.
 */

export { default } from "../server/janakaHandler.js"
