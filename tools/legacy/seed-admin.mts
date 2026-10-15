/**
 * Buat akun admin pertama (atau perbaiki akun yang sudah ada).
 *
 * Menjalankan:
 *   npm run seed:admin
 *
 * Variabel wajib di .env:
 *   ADMIN_UID         UID dari Firebase Auth (lihat konsol Firebase > Authentication)
 *   ADMIN_NAMA        Nama lengkap
 *   ADMIN_USERNAME    Username tanpa spasi (contoh: admin.ponorogo)
 *   ADMIN_PASSWORD    Minimal 6 karakter, tanpa spasi
 *
 * Opsional:
 *   ADMIN_JABATAN
 *   ADMIN_NIP
 *   ADMIN_CATATAN
 */

import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { keEmailAkun, normalisasiUsername } from "../../src/lib/akun.ts"

function bacaEnv() {
  try {
    const isi = readFileSync(resolve(".env"), "utf8")
    for (const baris of isi.split("\n")) {
      const [k, ...v] = baris.trim().split("=")
      if (k && !k.startsWith("#")) process.env[k] = v.join("=").replace(/^"|"$/g, "")
    }
  } catch {
    /* .env tidak ada — gunakan process.env yang sudah diset */
  }
}
bacaEnv()

const { ADMIN_UID, ADMIN_NAMA, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_JABATAN, ADMIN_NIP, ADMIN_CATATAN } = process.env as Record<string, string>

if (!ADMIN_UID || !ADMIN_NAMA || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error("❌ Variabel wajib hilang:")
  if (!ADMIN_UID) console.error("  ADMIN_UID")
  if (!ADMIN_NAMA) console.error("  ADMIN_NAMA")
  if (!ADMIN_USERNAME) console.error("  ADMIN_USERNAME")
  if (!ADMIN_PASSWORD) console.error("  ADMIN_PASSWORD")
  console.error("\nContoh .env:")
  console.error("  ADMIN_UID=abc123")
  console.error("  ADMIN_NAMA=\"Admin Ponorogo\"")
  console.error("  ADMIN_USERNAME=admin.ponorogo")
  console.error("  ADMIN_PASSWORD=Rahasia123")
  process.exit(1)
}

if (!getApps().length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa) initializeApp({ credential: cert(JSON.parse(sa)) })
  else initializeApp({ credential: applicationDefault() })
}

const auth = getAuth()
const db = getFirestore()

async function main() {
  console.log(`\n🔧 Memproses akun admin: ${ADMIN_USERNAME} (UID: ${ADMIN_UID})`)

  // 1) Pastikan akun ada di Firebase Auth dengan email semu
  const email = keEmailAkun(ADMIN_USERNAME)

  let userRecord
  try {
    userRecord = await auth.getUser(ADMIN_UID)
    if (userRecord.email !== email) {
      console.log(`   📧 Email beda: ${userRecord.email} → ${email} (diupdate)`)
      await auth.updateUser(ADMIN_UID, { email, emailVerified: false, disabled: false })
    } else {
      console.log(`   ✅ Email sudah cocok: ${email}`)
    }
  } catch {
    console.log(`   ➕ Membuat user baru di Firebase Auth...`)
    userRecord = await auth.createUser({
      uid: ADMIN_UID,
      email,
      password: ADMIN_PASSWORD!,
      displayName: ADMIN_NAMA,
      emailVerified: false,
      disabled: false,
    })
    console.log(`   ✅ User dibuat: ${userRecord.uid!}`)
  }

  // 2) Set password (mengabaikan yang lama)
  await auth.updateUser(ADMIN_UID, { password: ADMIN_PASSWORD! })
  console.log(`   🔒 Password diatur`)

  // 3) Simpan profil ke Firestore
  const now = new Date().toISOString()
  const username = normalisasiUsername(ADMIN_USERNAME)
  const izinAdmin = {
    menuDashboard: true,
    menuMapping: true,
    menuReklame: true,
    menuLaporan: true,
    menuRiwayat: true,
    aksiTambahTitik: true,
    aksiHapusLaporan: true,
    aksiCetakRekap: true,
    aksiKelolaPengguna: true,
    aksiUbahPassword: true,
    aksiLihatDashboard: true,
  }

  const docRef = db.collection("users").doc(ADMIN_UID)
  await docRef.set({
    uid: ADMIN_UID,
    username,
    email,
    namaLengkap: ADMIN_NAMA,
    role: "admin",
    jabatan: ADMIN_JABATAN ?? "",
    nip: ADMIN_NIP ?? "",
    catatan: ADMIN_CATATAN ?? "",
    permissions: izinAdmin,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }, { merge: true })
  console.log(`   💾 Profil disimpan ke users/${ADMIN_UID}`)

  console.log(`\n✅ Selesai. Masuk dengan:`)
  console.log(`   Username: ${username}`)
  console.log(`   Password: ${ADMIN_PASSWORD}`)
}

main().catch((err) => {
  console.error("❌ Gagal:", err)
  process.exit(1)
})