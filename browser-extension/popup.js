const RELAY_RESULT_MESSAGE = "RELAY_PART_LOOKUP_RESULT";
const RELAY_TAB_PATTERNS = [
  "https://relay-ryoz.vercel.app/console*",
  "https://relay-auroradef-1s-projects.vercel.app/console*",
  "https://relay-git-main-auroradef-1s-projects.vercel.app/console*",
  "http://localhost/console*",
  "http://127.0.0.1/console*"
];

const PART_SYNONYMS = {
  track: ["crawler", "undercarriage"],
  crawler: ["track", "undercarriage"],
  idler: ["roller", "wheel"],
  roller: ["idler", "wheel"],
  hose: ["pipe", "tube", "line"],
  seal: ["gasket", "oring", "o-ring"],
  lamp: ["light", "headlamp", "worklight"],
  glass: ["window", "windscreen", "windshield"],
  filter: ["element", "strainer"],
  cable: ["wire", "linkage", "control"]
};

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
  fillSearch: document.querySelector("#fill-search"),
  scan: document.querySelector("#scan-page"),
  status: document.querySelector("#status"),
  resultsSection: document.querySelector("#results-section"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count")
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length >= 2))];
}

function expandedRequestTokens(value) {
  const original = tokens(value);
  return [...new Set(original.flatMap((token) => [token, ...(PART_SYNONYMS[token] || [])]))];
}

function extractPartNumber(text) {
  const labelled = text.match(/\b(?:part|item|stock|product)\s*(?:number|no\.?|#|code)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})\b/i);
  if (labelled) return labelled[1];

  const candidates = text.match(/\b(?=[A-Z0-9./_-]{5,}\b)(?=[A-Z0-9./_-]*\d)[A-Z0-9]+(?:[./_-][A-Z0-9]+)+\b/gi);
  return candidates?.[0] || "";
}

function scoreCandidate(candidate, context) {
  const haystack = normalize(candidate.text);
  const request = normalize(context.requestDescription);
  const originalTokens = tokens(request);
  const expandedTokens = expandedRequestTokens(request);
  const modelTokens = tokens(context.model).filter((token) => /^tb\d|^[a-z]*\d+[a-z-]*$/.test(token));
  let score = 0;
  let requestMatches = 0;

  if (request.length >= 4 && haystack.includes(request)) score += 55;
  for (const token of expandedTokens) {
    if (!haystack.includes(token)) continue;
    const isOriginal = originalTokens.includes(token);
    score += isOriginal ? (token.length >= 5 ? 16 : 10) : 5;
    if (isOriginal) requestMatches += 1;
  }
  for (const token of modelTokens) {
    if (haystack.includes(token)) score += 14;
  }
  if (context.serialNumber && haystack.includes(normalize(context.serialNumber))) score += 24;
  if (context.machineReference && haystack.includes(normalize(context.machineReference))) score += 8;

  const partNumber = extractPartNumber(candidate.text);
  if (partNumber) score += 5;
  if (candidate.link) score += 2;

  return {
    ...candidate,
    score,
    requestMatches,
    partNumber,
    confidence: score >= 65 ? "Strong page match" : score >= 32 ? "Possible match" : "Broad match"
  };
}

function rankCandidates(page, context) {
  return page.items
    .map((candidate) => scoreCandidate(candidate, context))
    .filter((candidate) => candidate.requestMatches > 0 && candidate.score >= 12)
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length)
    .slice(0, 10);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function renderContext() {
  const context = state.context;
  elements.emptyContext.hidden = Boolean(context);
  elements.contextDetails.hidden = !context;
  elements.fillSearch.disabled = !context;
  elements.scan.disabled = !context;

  if (!context) {
    setStatus("Waiting for RELAY lookup context.");
    return;
  }

  elements.machineReference.textContent = context.machineReference || "Not recorded";
  elements.machineModel.textContent = [context.make, context.model].filter(Boolean).join(" ") || "Not recorded";
  elements.machineSerial.textContent = context.serialNumber || "Not recorded";
  elements.requestDescription.textContent = context.requestDescription;
  setStatus("Open a supplier or manufacturer page, then scan its visible content.");
}

function renderResults() {
  elements.results.replaceChildren();
  elements.resultsSection.hidden = state.results.length === 0;
  elements.resultCount.textContent = String(state.results.length);

  state.results.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "result";

    const topline = document.createElement("div");
    topline.className = "result-topline";
    const partNumber = document.createElement("span");
    partNumber.className = "part-number";
    partNumber.textContent = result.partNumber || `Result ${index + 1}`;
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
    confidence: result.confidence
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
  elements.scan.disabled = true;
  elements.resultsSection.hidden = true;
  setStatus("Reading visible catalogue content on this tab...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal supplier or manufacturer webpage before scanning.");
    }

    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectVisiblePageCandidates
    });
    const page = execution.result;
    if (!page?.items?.length) {
      throw new Error("No readable product or catalogue content was visible on this page.");
    }

    state.page = page;
    state.results = rankCandidates(page, state.context);
    renderResults();
    setStatus(
      state.results.length
        ? `Scanned ${page.items.length} visible page sections. Review the ranked suggestions.`
        : `Scanned ${page.items.length} visible page sections, but none matched the requested part terms.`,
      state.results.length === 0
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to scan this page.", true);
  } finally {
    elements.scan.disabled = !state.context;
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

    const query = [state.context.model, state.context.requestDescription]
      .filter(Boolean)
      .join(" ")
      .trim();
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: populateVisibleSearchField,
      args: [query]
    });
    const result = execution.result;
    if (!result?.filled) {
      throw new Error("No visible website search field was detected. Use the site's search manually, then scan the results.");
    }

    setStatus(`Filled the website search with “${query}”. Review and submit the website search, then scan its results.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to fill this website's search.", true);
  } finally {
    elements.fillSearch.disabled = !state.context;
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

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const linkElement = element.matches("a[href]") ? element : element.querySelector("a[href]");
    items.push({
      text,
      link: linkElement?.href || ""
    });
  }

  if (items.length < 10) {
    const fallbackLines = String(document.body?.innerText || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 8 && line.length <= 500);
    for (const text of fallbackLines) {
      if (items.length >= 800) break;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ text, link: "" });
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
