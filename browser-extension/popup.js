const RELAY_RESULT_MESSAGE = "RELAY_PART_LOOKUP_RESULT";
const NOTIFICATIONS_ENABLED_KEY = "relayAdminNotificationsEnabled";
const RELAY_TAB_PATTERNS = [
  "https://relay-ryoz.vercel.app/console*",
  "https://relay-auroradef-1s-projects.vercel.app/console*",
  "https://relay-git-main-auroradef-1s-projects.vercel.app/console*",
  "http://localhost/console*",
  "http://127.0.0.1/console*"
];

const state = {
  context: null,
  results: [],
  page: null
};

const elements = {
  clear: document.querySelector("#clear-context"),
  contextDetails: document.querySelector("#context-details"),
  emptyContext: document.querySelector("#empty-context"),
  machineReference: document.querySelector("#machine-reference"),
  machineModel: document.querySelector("#machine-model"),
  machineSerial: document.querySelector("#machine-serial"),
  requestDescription: document.querySelector("#request-description"),
  suggestedPartRow: document.querySelector("#suggested-part-row"),
  suggestedPartNumber: document.querySelector("#suggested-part-number"),
  fillSearch: document.querySelector("#fill-search"),
  scan: document.querySelector("#scan-page"),
  status: document.querySelector("#status"),
  resultsSection: document.querySelector("#results-section"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count")
};
elements.notificationsEnabled = document.querySelector("#notifications-enabled");
elements.notificationState = document.querySelector("#notification-state");

function normalizePartNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function preferredSuggestedPartNumber(context) {
  return Array.isArray(context?.suggestedPartNumbers)
    ? String(context.suggestedPartNumbers[0] || "").trim()
    : "";
}

function isTakeuchiCatalogueUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "takeuchijp.mizecx.com" || hostname.includes("takeuchi");
  } catch {
    return false;
  }
}

function cleanPartNumber(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^[#:\s-]+|[.,;:\s]+$/g, "")
    .replace(/\s+/g, "")
    .slice(0, 120);
  return cleaned.length >= 4
    && /[0-9]/.test(cleaned)
    && /^[a-z0-9][a-z0-9./_-]*$/i.test(cleaned)
    ? cleaned
    : "";
}

function extractPartNumber(candidate) {
  for (const hint of candidate.partNumberHints || []) {
    const partNumber = cleanPartNumber(hint);
    if (partNumber) return partNumber;
  }

  const labelled = candidate.text.match(
    /\b(?:manufacturer\s*)?(?:part|item|stock|product|catalog(?:ue)?|oem)\s*(?:number|no\.?|#|code|ref(?:erence)?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,40})\b/i
  );
  const labelledPartNumber = cleanPartNumber(labelled?.[1]);
  if (labelledPartNumber) return labelledPartNumber;

  const candidates = candidate.text.match(
    /\b(?=[A-Z0-9./_-]{5,}\b)(?=[A-Z0-9./_-]*\d)[A-Z0-9]+(?:[./_-][A-Z0-9]+)+\b/gi
  );
  return cleanPartNumber(candidates?.[0]);
}

function extractCandidate(candidate) {
  const partNumber = extractPartNumber(candidate);
  return {
    ...candidate,
    partNumber
  };
}

function rankCandidates(page, context) {
  const searchedPartNumber = preferredSuggestedPartNumber(context);
  const normalizedSearch = normalizePartNumber(searchedPartNumber);
  const takeuchiCatalogue = isTakeuchiCatalogueUrl(page.url);
  const exactMatches = page.items
    .map(extractCandidate)
    .filter((candidate) => normalizedSearch
      && normalizePartNumber(candidate.partNumber) === normalizedSearch)
    .map((candidate) => ({
      ...candidate,
      score: 200,
      confidence: takeuchiCatalogue ? "Takeuchi number verified" : "Exact number found",
      verificationType: takeuchiCatalogue
        ? "takeuchi_exact_part_number"
        : "external_catalogue_match",
      searchedPartNumber
    }))
    .slice(0, 10);

  return {
    numbered: exactMatches,
    supportingMatches: normalizedSearch
      ? page.items.filter((candidate) =>
        normalizePartNumber(candidate.text).includes(normalizedSearch)
      ).length
      : 0,
    strategy: "exact_part_number",
    searchedPartNumber
  };
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function renderContext() {
  const context = state.context;
  elements.emptyContext.hidden = Boolean(context);
  elements.contextDetails.hidden = !context;
  const suggestedPartNumber = preferredSuggestedPartNumber(context);
  elements.fillSearch.disabled = !context || !suggestedPartNumber;
  elements.scan.disabled = !context || !suggestedPartNumber;

  if (!context) {
    setStatus("Waiting for RELAY lookup context.");
    return;
  }

  elements.machineReference.textContent = context.machineReference || "Not recorded";
  elements.machineModel.textContent = [context.make, context.model].filter(Boolean).join(" ") || "Not recorded";
  elements.machineSerial.textContent = context.serialNumber || "Not recorded";
  elements.requestDescription.textContent = context.requestDescription;
  elements.suggestedPartRow.hidden = !suggestedPartNumber;
  elements.suggestedPartNumber.textContent = suggestedPartNumber;
  setStatus(
    suggestedPartNumber
      ? `Ready to search every website for exact part number ${suggestedPartNumber}.`
      : "Select a numbered RELAY catalogue suggestion before searching a website.",
    !suggestedPartNumber
  );
}

function renderResults() {
  elements.results.replaceChildren();
  elements.resultsSection.hidden = state.results.length === 0;
  elements.resultCount.textContent = String(state.results.length);

  state.results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result";

    const topline = document.createElement("div");
    topline.className = "result-topline";
    const partNumber = document.createElement("span");
    partNumber.className = "part-number";
    partNumber.textContent = result.partNumber;
    const confidence = document.createElement("span");
    confidence.className = `confidence${result.score >= 65 ? " strong" : ""}`;
    confidence.textContent = result.confidence;
    topline.append(partNumber, confidence);

    const description = document.createElement("p");
    description.textContent = result.text;

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.textContent = "Send suggestion to RELAY";
    useButton.addEventListener("click", () => sendResultToRelay(result));

    card.append(topline, description, useButton);
    elements.results.append(card);
  });
}

async function sendResultToRelay(result) {
  const relayTabs = await chrome.tabs.query({ url: RELAY_TAB_PATTERNS });
  if (relayTabs.length === 0) {
    setStatus("Open RELAY Operations Console before sending the suggestion.", true);
    return;
  }

  const payload = {
    pageTitle: state.page?.title || "Supplier website",
    pageUrl: result.link || state.page?.url || "",
    candidateText: result.text,
    partNumber: result.partNumber,
    confidence: result.confidence,
    verificationType: result.verificationType,
    searchedPartNumber: result.searchedPartNumber
  };

  let delivered = false;
  for (const tab of relayTabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: RELAY_RESULT_MESSAGE,
        result: payload
      });
      delivered = true;
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
      break;
    } catch {
      // A stale or unsupported RELAY tab should not block another matching tab.
    }
  }

  if (delivered) {
    await chrome.storage.local.set({ relayLastSuggestion: payload });
    setStatus("Suggestion sent to RELAY AI for manual verification.");
  } else {
    setStatus("Refresh the RELAY tab so the extension bridge can connect, then try again.", true);
  }
}

async function scanCurrentPage() {
  if (!state.context) return;
  const suggestedPartNumber = preferredSuggestedPartNumber(state.context);
  if (!suggestedPartNumber) {
    setStatus("Select a numbered RELAY catalogue suggestion before scanning any website.", true);
    return;
  }
  elements.scan.disabled = true;
  elements.resultsSection.hidden = true;
  setStatus("Reading visible catalogue content on this tab...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal supplier or manufacturer webpage before scanning.");
    }

    const executions = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: collectVisiblePageCandidates
    });
    const pages = executions.map((execution) => execution.result).filter(Boolean);
    const mainPage = executions.find((execution) => execution.frameId === 0)?.result;
    const page = {
      title: mainPage?.title || tab.title || "Supplier website",
      url: tab.url || mainPage?.url || "",
      items: pages.flatMap((result) => result.items || [])
    };
    if (!page?.items?.length) {
      throw new Error("No readable product or catalogue content was visible on this page.");
    }

    state.page = page;
    const ranked = rankCandidates(page, state.context);
    state.results = ranked.numbered;
    renderResults();
    setStatus(
      state.results.length
        ? `Exact part number ${ranked.searchedPartNumber} appears as a product identifier on this page.`
        : ranked.supportingMatches > 0
          ? `The page mentions ${ranked.searchedPartNumber}, but does not expose it as a product or catalogue number. Open the product detail page and scan again.`
          : `The page does not contain exact part number ${ranked.searchedPartNumber}. No result was returned.`,
      state.results.length === 0
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to scan this page.", true);
  } finally {
    elements.scan.disabled = !preferredSuggestedPartNumber(state.context);
  }
}

async function fillWebsiteSearch() {
  if (!state.context) return;
  elements.fillSearch.disabled = true;
  setStatus("Looking for a visible search field on this page...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal supplier or manufacturer webpage first.");
    }

    const suggestedPartNumber = preferredSuggestedPartNumber(state.context);
    if (!suggestedPartNumber) {
      throw new Error("Select a numbered RELAY catalogue suggestion before searching any website.");
    }
    const query = suggestedPartNumber;
    const executions = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: populateVisibleSearchField,
      args: [query]
    });
    const result = executions.find((execution) => execution.result?.filled)?.result;
    if (!result?.filled) {
      throw new Error("No visible website search field was detected. Use the site's search manually, then scan the results.");
    }

    setStatus(`Filled the website search with exact part number ${query}. Submit the search, then scan to verify the same number.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to fill this website's search.", true);
  } finally {
    elements.fillSearch.disabled = !preferredSuggestedPartNumber(state.context);
  }
}

function populateVisibleSearchField(query) {
  const selectors = [
    "input[type='search']",
    "input[role='searchbox']",
    "input[name*='search' i]",
    "input[name*='query' i]",
    "input[name*='keyword' i]",
    "input[name*='part' i]",
    "input[id*='search' i]",
    "input[id*='query' i]",
    "input[placeholder*='search' i]",
    "input[placeholder*='part' i]"
  ];
  const field = [...document.querySelectorAll(selectors.join(","))].find((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.disabled
      && !element.readOnly
      && style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;
  });
  if (!field) return { filled: false };

  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(field, query);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.focus();
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  return { filled: true };
}

function collectVisiblePageCandidates() {
  const selectors = [
    "tr",
    "[role='row']",
    "article",
    "li",
    "[class*='product' i]",
    "[class*='result' i]",
    "[class*='part' i]",
    "[class*='item' i]",
    "[class*='card' i]"
  ];
  const seen = new Set();
  const items = [];
  const partNumberAttribute = /(?:sku|mpn|part[-_:]?(?:number|no)|product[-_:]?(?:code|id)|item[-_:]?(?:number|no)|stock[-_:]?(?:code|id)|catalog(?:ue)?[-_:]?(?:number|no))/i;

  const addCandidate = ({ text, link = "", partNumberHints = [], source = "Visible page" }) => {
    const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
    if (normalizedText.length < 8 || normalizedText.length > 1200 || items.length >= 800) return;

    const normalizedHints = [...new Set(
      partNumberHints
        .map((value) => String(value || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )];
    const key = `${normalizedText.toLowerCase()}|${normalizedHints.join("|").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      text: normalizedText,
      link,
      partNumberHints: normalizedHints,
      source
    });
  };

  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity || "1") > 0
      && rect.width > 0
      && rect.height > 0;
  };

  for (const element of document.querySelectorAll(selectors.join(","))) {
    if (items.length >= 800 || !isVisible(element)) continue;
    const text = String(element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 8 || text.length > 1200) continue;

    const linkElement = element.matches("a[href]") ? element : element.querySelector("a[href]");
    const partNumberHints = [];
    const descendants = [...element.querySelectorAll("*")].slice(0, 250);
    for (const candidateElement of [element, ...descendants]) {
      for (const attribute of candidateElement.attributes || []) {
        if (partNumberAttribute.test(attribute.name)) partNumberHints.push(attribute.value);
      }
      if (candidateElement.matches("[itemprop='sku'],[itemprop='mpn'],[itemprop='productID']")) {
        partNumberHints.push(
          candidateElement.getAttribute("content")
          || candidateElement.getAttribute("value")
          || candidateElement.textContent
          || ""
        );
      }
    }
    if (linkElement?.href) {
      try {
        const linkUrl = new URL(linkElement.href);
        for (const [name, value] of linkUrl.searchParams) {
          if (partNumberAttribute.test(name)) partNumberHints.push(value);
        }
      } catch {
        // Ignore malformed links while retaining the visible result text.
      }
    }
    addCandidate({
      text,
      link: linkElement?.href || "",
      partNumberHints
    });
  }

  const structuredProducts = [];
  const visitStructuredData = (value) => {
    if (!value || structuredProducts.length >= 100) return;
    if (Array.isArray(value)) {
      value.forEach(visitStructuredData);
      return;
    }
    if (typeof value !== "object") return;

    const type = Array.isArray(value["@type"]) ? value["@type"].join(" ") : value["@type"];
    if (/product|individualproduct|productmodel/i.test(String(type || ""))) {
      structuredProducts.push(value);
    }
    for (const nested of Object.values(value)) visitStructuredData(nested);
  };
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      visitStructuredData(JSON.parse(script.textContent || ""));
    } catch {
      // Invalid third-party structured data should not prevent the visible-page scan.
    }
  }
  for (const product of structuredProducts) {
    const brand = typeof product.brand === "object" ? product.brand?.name : product.brand;
    const partNumberHints = [
      product.sku,
      product.mpn,
      product.productID,
      product.productId
    ];
    addCandidate({
      text: [
        product.name,
        product.description,
        brand,
        partNumberHints.filter(Boolean).join(" ")
      ].filter(Boolean).join(" · "),
      link: typeof product.url === "string" ? product.url : "",
      partNumberHints,
      source: "Structured product data"
    });
  }

  for (const metadata of document.querySelectorAll(
    "meta[itemprop='sku'],meta[itemprop='mpn'],meta[itemprop='productID'],meta[property='product:retailer_item_id']"
  )) {
    const partNumber = metadata.getAttribute("content") || "";
    addCandidate({
      text: `${document.title} · Part number ${partNumber}`,
      link: window.location.href,
      partNumberHints: [partNumber],
      source: "Product metadata"
    });
  }

  if (items.length < 10) {
    const fallbackLines = String(document.body?.innerText || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 8 && line.length <= 500);
    for (const text of fallbackLines) {
      if (items.length >= 800) break;
      addCandidate({ text });
    }
  }

  return {
    title: document.title,
    url: window.location.href,
    items
  };
}

elements.fillSearch.addEventListener("click", fillWebsiteSearch);
elements.scan.addEventListener("click", scanCurrentPage);
elements.clear.addEventListener("click", async () => {
  state.context = null;
  state.results = [];
  state.page = null;
  await chrome.storage.local.remove(["relayLookupContext", "relayLastSuggestion"]);
  renderContext();
  renderResults();
});

chrome.storage.local.get(["relayLookupContext"]).then(({ relayLookupContext }) => {
  state.context = relayLookupContext || null;
  renderContext();
});

chrome.storage.local.get([NOTIFICATIONS_ENABLED_KEY]).then((stored) => {
  const enabled = stored[NOTIFICATIONS_ENABLED_KEY] !== false;
  elements.notificationsEnabled.checked = enabled;
  elements.notificationState.textContent = enabled
    ? "Active while an authenticated RELAY tab is open."
    : "Popup notifications are paused.";
});

elements.notificationsEnabled.addEventListener("change", async () => {
  const enabled = elements.notificationsEnabled.checked;
  await chrome.storage.local.set({ [NOTIFICATIONS_ENABLED_KEY]: enabled });
  elements.notificationState.textContent = enabled
    ? "Active while an authenticated RELAY tab is open."
    : "Popup notifications are paused.";
});
