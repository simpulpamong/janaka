import type { VercelRequest, VercelResponse } from "@vercel/node"
import { removeSubscription, saveSubscription, sendPush, verify } from "../server/pushNotifications.js"
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { const user = await verify(req); const action = String(req.query.action || req.body?.action || "")
    if (req.method === "POST" && action === "subscribe") { await saveSubscription(user.uid, req.body.subscription); return res.status(200).json({ ok: true }) }
    if ((req.method === "POST" || req.method === "DELETE") && action === "unsubscribe") { await removeSubscription(user.uid, req.body.endpoint); return res.status(200).json({ ok: true }) }
    if (req.method === "POST" && action === "test") { return res.status(200).json(await sendPush({ title: "JANAKA", body: "Notifikasi berhasil diaktifkan", data: { url: "/" } }, s => s.uid === user.uid)) }
    return res.status(400).json({ error: "invalid action" })
  } catch { return res.status(401).json({ error: "unauthorized" }) }
}
