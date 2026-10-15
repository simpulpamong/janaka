// @ts-check
/*
 * Konfigurasi PostCSS.
 *
 * ⚠️ Tetap `.js` — PostCSS memuat konfigurasi lewat `postcss-load-config`,
 * yang hanya mengenali `.js`/`.cjs`/`.mjs`/`.json`. Konfigurasi `.ts` akan
 * diabaikan diam-diam dan utility class Tailwind tidak akan diproses.
 */

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
