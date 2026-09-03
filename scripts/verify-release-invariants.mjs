import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function readRequiredFile(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath}: required release file is missing`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function requireText(relativePath, text, description) {
  const content = readRequiredFile(relativePath);
  if (content && !content.includes(text)) {
    failures.push(`${relativePath}: missing ${description}`);
  }
}

function forbidText(relativePath, text, description) {
  const content = readRequiredFile(relativePath);
  if (content && content.includes(text)) {
    failures.push(`${relativePath}: contains forbidden ${description}`);
  }
}

const labelFile = "lib/dymo-label.ts";
requireText(labelFile, "<BarcodeFormat>Code39</BarcodeFormat>", "Code 39 barcode encoding");
forbidText(labelFile, "<BarcodeFormat>Code128Auto</BarcodeFormat>", "legacy Code 128 barcode encoding");
requireText(labelFile, '"PARTS READY"', "approved PARTS READY heading");
requireText(labelFile, '"REQUESTED_BY_TEXT"', "requested-by label field");
requireText(labelFile, '"READY_AT_TEXT"', "READY date/time label field");
requireText(labelFile, '"BARCODE_JOB_TEXT"', "human-readable job number below the barcode");

const printerFile = "components/dymo-print-station.tsx";
requireText(printerFile, "requestedBy:", "requested-by data passed to the printer template");
requireText(printerFile, "readyAt:", "READY timestamp passed to the printer template");

const operationsFile = "app/admin/page.tsx";
requireText(operationsFile, "Bin location required before marking this ticket READY.", "Operations READY validation");
requireText(operationsFile, "syncNexusEcommerceOrderStatus", "NEXUS order-status synchronization");

const consoleFile = "components/console/console-ticket-action-modal.tsx";
requireText(consoleFile, "Enter a bin location before marking this job READY.", "Console READY bin validation");
requireText(consoleFile, 'placeholder="Enter Stores bin location"', "Console bin-location input");

const readyBinMigrationFile = "supabase/migrations/20260903064344_enforce_ready_bin_location.sql";
requireText(
  readyBinMigrationFile,
  "create trigger enforce_ready_ticket_bin_location",
  "database READY bin-location trigger",
);
requireText(
  readyBinMigrationFile,
  "new.status = 'READY' and nullif(btrim(new.bin_location), '') is null",
  "database READY bin-location validation",
);

requireText(
  "components/notification-provider.tsx",
  "supabase.channel(RELAY_SYSTEM_BROADCAST_CHANNEL)",
  "all-user broadcast Realtime subscription",
);
requireText(
  "app/control/page.tsx",
  "<AdminBroadcastPanel />",
  "Admin Control announcement panel",
);
requireText(
  "components/app-runtime.tsx",
  "<NotificationToasts />",
  "global in-browser notification popups",
);
forbidText(
  "components/app-runtime.tsx",
  "!isFrontCounter ? <NotificationToasts /> : null",
  "Front Counter notification suppression",
);

requireText(
  "app/api/integrations/nexus/orders/route.ts",
  'supabase.rpc("accept_nexus_ecommerce_order"',
  "NEXUS ecommerce order intake",
);
requireText(
  "app/api/integrations/nexus/orders/status/route.ts",
  "NEXUS_ORDER_STATUS_URL",
  "NEXUS order-status callback",
);
requireText(
  "supabase/migrations/20260813131929_add_nexus_ecommerce_order_bridge.sql",
  "accept_nexus_ecommerce_order",
  "NEXUS ecommerce database migration",
);
requireText(
  "supabase/migrations/20260812124924_add_requested_by_to_ready_labels.sql",
  "requested_by",
  "READY-label requester migration",
);

if (failures.length > 0) {
  console.error("RELAY release integrity check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nProduction build blocked. Restore the required workflow before releasing.");
  process.exit(1);
}

console.log("RELAY release integrity check passed.");
console.log("Protected: Code 39 labels, READY metadata and bin enforcement, browser notifications, and NEXUS order bridge.");
