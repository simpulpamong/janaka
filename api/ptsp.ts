/**
 * Entry point Vercel Function untuk seluruh data PTSP.
 *
 * Logikanya di `server/ptspHandler.ts` (di luar `api/`) supaya file ini
 * tetap tipis. `vercel.json` mengarahkan `/api/*` dan `/v1/*` ke sini.
 *
 * ⚠️ Ekstensi `.js` wajib di impor relatif: output Vercel adalah ESM
 * native (`"type": "module"`), dan ESM menolak impor tanpa ekstensi.
 */

export { default } from "../server/ptspHandler.js"
