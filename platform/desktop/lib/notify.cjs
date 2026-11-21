"use strict";

/**
 * One poll: asks the hub for notifications not seen yet, shows each one with `show`, and marks it seen only after it was shown.
 * A hub that is down, or a notification that cannot be shown, is left for the next poll.
 */
async function pollNotifications({ base, token, fetch: f = fetch, show }) {
  const headers = { authorization: `Bearer ${token}` };
  let list;
  try {
    const r = await f(`${base}/api/notifications?unseen=1`, { headers });
    if (!r.ok) return;
    list = await r.json();
  } catch { return; }
  if (!Array.isArray(list)) return;
  for (const n of list) {
    try { show(n); } catch { continue; }
    try { await f(`${base}/api/notifications/${encodeURIComponent(n.id)}/seen`, { method: "POST", headers }); } catch { /* shown twice at worst */ }
  }
}

module.exports = { pollNotifications };
