import { firebaseApp } from "./config"
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query as fsQuery,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  onSnapshot,
  type CollectionReference,
  type DocumentReference,
  type QueryConstraint,
  type Unsubscribe,
  type DocumentData,
} from "firebase/firestore"

export const db = getFirestore(firebaseApp)

/** Collection reference generik. */
export function col<T = DocumentData>(path: string): CollectionReference<T> {
  return collection(db, path) as CollectionReference<T>
}

/** Document reference generik. */
export function docRef<T = DocumentData>(
  path: string,
  ...segments: string[]
): DocumentReference<T> {
  return doc(db, path, ...segments) as DocumentReference<T>
}

/** Ambil satu dokumen; null bila tidak ada. */
export async function getDocument<T>(
  collectionPath: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const snap = await getDoc(docRef<T>(collectionPath, id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id } as T & { id: string }
}

/** Ambil semua dokumen pada sebuah koleksi dengan constraint opsional. */
export async function getCollection<T>(
  collectionPath: string,
  constraints: QueryConstraint[] = [],
): Promise<(T & { id: string })[]> {
  const snap = await getDocs(fsQuery(col(collectionPath), ...constraints))
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string })
}

/** Buat dokumen baru dengan id otomatis. */
export async function createDocument<T extends DocumentData>(
  collectionPath: string,
  data: T,
): Promise<string> {
  const ref = await addDoc(col(collectionPath), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/** Tulis sebagian field (merge) — aman untuk update parsial. */
export async function setDocument<T extends DocumentData>(
  collectionPath: string,
  id: string,
  data: T,
): Promise<void> {
  await setDoc(
    docRef(collectionPath, id),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/** Update sebagian field. */
export async function updateDocument(
  collectionPath: string,
  id: string,
  data: Partial<DocumentData>,
): Promise<void> {
  await updateDoc(docRef(collectionPath, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/** Hapus dokumen. */
export async function deleteDocument(
  collectionPath: string,
  id: string,
): Promise<void> {
  await deleteDoc(docRef(collectionPath, id))
}

/** Realtime listener untuk sebuah koleksi. */
export function subscribeCollection<T>(
  collectionPath: string,
  constraints: QueryConstraint[],
  callback: (data: (T & { id: string })[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    fsQuery(col(collectionPath), ...constraints),
    (snap) => {
      callback(
        snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string }),
      )
    },
    onError,
  )
}

export { collection, doc, where, orderBy, fsLimit, serverTimestamp, onSnapshot }
