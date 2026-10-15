import { cn } from "@/lib/cn"

/**
 * Logo JANAKA.
 *
 * Semua gambar memakai berkas resmi di `public/assets/` — satu sumber,
 * dipakai ulang di sidebar, layar login, halaman luar, dan `manifest`.
 * Tidak ada SVG buatan yang bisa melenceng dari logo asli.
 *
 * ## Kenapa bukan `<img>` telanjang
 * Emblem resmi berbentuk lingkaran pekat dengan tepi transparan. Di atas
 * sidebar gelap, `<img>` telanjang membuat tepinya terlihat bergerigi
 * saat diskalakan ke 40px. `object-contain` di atas latar bundar
 * menjaga tepinya rapi, dan `decoding="async"` mencegah gambar
 * memblokir render halaman.
 *
 * Ukuran lewat `className` (bukan atribut `width`/`height`) supaya pemanggil
 * bebas menentukan ukuran dari satu komponen — `w-8`, `w-10`, `w-24`, dan
 * seterusnya semuanya lewat jalur yang sama.
 */
export function JanakaLogo({
  className = "h-10 w-10",
  /** Sembunyikan gambar untuk pembaca layar (ikon dekoratif). */
  dekoratif = false,
  alt = "Logo JANAKA — Satpol PP Kabupaten Ponorogo",
}: {
  className?: string
  dekoratif?: boolean
  alt?: string
}) {
  return (
    <img
      src="/assets/icon-192.png"
      alt={dekoratif ? "" : alt}
      aria-hidden={dekoratif || undefined}
      width={512}
      height={512}
      decoding="async"
      // Logo sudah vektor-perfect di 512; ambil yang paling besar yang ada
      // supaya tetap tajam saat di-zoom di layar rapat.
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  )
}

export default JanakaLogo
