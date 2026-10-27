import type { VercelRequest, VercelResponse } from "@vercel/node"
import { checkExpired, sendPush } from "../../server/pushNotifications.js"
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" })
  const changed = await checkExpired(); const result = await sendPush({ title: "JANAKA", body: `${changed} status PTSP kedaluwarsa diperbarui`, data: { url: "/reklame" } })
  return res.status(200).json({ changed, ...result })
}
