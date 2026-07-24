const ADMIN_NOTIFICATION_MESSAGE = "RELAY_ADMIN_NOTIFICATION";
const NOTIFICATIONS_ENABLED_KEY = "relayAdminNotificationsEnabled";
const SEEN_NOTIFICATION_IDS_KEY = "relaySeenAdminNotificationIds";
const NOTIFICATION_LINKS_KEY = "relayAdminNotificationLinks";
const MAX_SEEN_NOTIFICATION_IDS = 200;
const MAX_NOTIFICATION_LINKS = 80;
const RELAY_ORIGINS = new Set([
  "https://relay-ryoz.vercel.app",
  "https://relay-auroradef-1s-projects.vercel.app",
  "https://relay-git-main-auroradef-1s-projects.vercel.app"
]);

function isRelayOrigin(url) {
  return RELAY_ORIGINS.has(url.origin)
    || (
      url.protocol === "http:"
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
}

function relayOriginFromSender(sender) {
  try {
    const url = new URL(sender.tab?.url || "");
    return isRelayOrigin(url) ? url.origin : "";
  } catch {
    return "";
  }
}

function safeRelayPath(value) {
  const path = String(value || "").trim();
  return /^\/(?:tickets\/[a-z0-9-]+|tasks|console|requests)(?:[?#].*)?$/i.test(path)
    ? path
    : "/console";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function showAdminNotification(payload, origin) {
  const notificationId = cleanText(payload.id, 120);
  const title = cleanText(payload.title, 120);
  if (!notificationId || !title) return;

  const stored = await chrome.storage.local.get([
    NOTIFICATIONS_ENABLED_KEY,
    SEEN_NOTIFICATION_IDS_KEY,
    NOTIFICATION_LINKS_KEY
  ]);
  if (stored[NOTIFICATIONS_ENABLED_KEY] === false) return;

  const seenIds = Array.isArray(stored[SEEN_NOTIFICATION_IDS_KEY])
    ? stored[SEEN_NOTIFICATION_IDS_KEY].filter((id) => typeof id === "string")
    : [];
  if (seenIds.includes(notificationId)) return;

  const chromeNotificationId = `relay-admin-${notificationId}`;
  const href = safeRelayPath(payload.href);
  const links = stored[NOTIFICATION_LINKS_KEY]
    && typeof stored[NOTIFICATION_LINKS_KEY] === "object"
      ? stored[NOTIFICATION_LINKS_KEY]
      : {};
  const nextLinks = Object.fromEntries(
    Object.entries({
      ...links,
      [chromeNotificationId]: { origin, href, createdAt: Date.now() }
    })
      .sort((left, right) => (right[1]?.createdAt || 0) - (left[1]?.createdAt || 0))
      .slice(0, MAX_NOTIFICATION_LINKS)
  );

  await chrome.storage.local.set({
    [SEEN_NOTIFICATION_IDS_KEY]: [
      notificationId,
      ...seenIds.filter((id) => id !== notificationId)
    ].slice(0, MAX_SEEN_NOTIFICATION_IDS),
    [NOTIFICATION_LINKS_KEY]: nextLinks,
    relayLastAdminNotification: {
      title,
      body: cleanText(payload.body, 240),
      href,
      createdAt: new Date().toISOString()
    }
  });

  await chrome.notifications.create(chromeNotificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("notification-icon.svg"),
    title,
    message: cleanText(payload.body, 240) || "New RELAY admin activity.",
    contextMessage: "RELAY Admin",
    priority: payload.type === "new_ticket" || payload.type === "job_assigned" ? 2 : 1
  });
}

async function openRelayNotification(notificationId) {
  const stored = await chrome.storage.local.get(NOTIFICATION_LINKS_KEY);
  const target = stored[NOTIFICATION_LINKS_KEY]?.[notificationId];
  if (!target) return;
  const originUrl = new URL(target.origin);
  if (!isRelayOrigin(originUrl)) return;

  const url = `${target.origin}${safeRelayPath(target.href)}`;
  const tabs = await chrome.tabs.query({ url: `${target.origin}/*` });
  const existing = tabs.find((tab) => tab.id);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
  await chrome.notifications.clear(notificationId);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== ADMIN_NOTIFICATION_MESSAGE || !message.notification) {
    return;
  }

  const origin = relayOriginFromSender(sender);
  if (!origin) return;
  void showAdminNotification(message.notification, origin);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith("relay-admin-")) return;
  void openRelayNotification(notificationId);
});
