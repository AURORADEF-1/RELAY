const CANONICAL_SUPPLIER_DISPLAY_NAMES: Record<string, string> = {
  watling: "Watling JCB",
  "watling jcb": "Watling JCB",
  watlings: "Watling JCB",
  "watlings jcb": "Watling JCB",
  mpd: "Motor Parts Direct",
  "maxa trading": "Maxa",
  "xcmg uk": "Xcmg",
  "xcmg / hill engineering": "Hill Engineering",
};

const SUPPLIER_GENERIC_SUFFIXES = new Set([
  "&",
  "co",
  "company",
  "group",
  "inc",
  "international",
  "limited",
  "ltd",
  "sons",
  "services",
  "trading",
  "uk",
  "uk.",
  "gb",
]);

export function normalizeSupplierName(value: string) {
  return canonicalizeSupplierDisplayName(value).toLowerCase();
}

export function formatSupplierDisplayName(value: string) {
  return canonicalizeSupplierDisplayName(value);
}

export function canonicalizeSupplierDisplayName(value: string) {
  const normalized = normalizeSupplierSelectionKey(value);

  if (CANONICAL_SUPPLIER_DISPLAY_NAMES[normalized]) {
    return CANONICAL_SUPPLIER_DISPLAY_NAMES[normalized];
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeSupplierEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeSupplierSelectionKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function scoreSupplierNameMatch(leftName: string, rightName: string) {
  const leftKey = normalizeSupplierSelectionKey(leftName);
  const rightKey = normalizeSupplierSelectionKey(rightName);

  if (!leftKey || !rightKey) {
    return 0;
  }

  if (leftKey === rightKey) {
    return 1;
  }

  const leftTokens = leftKey.split(" ").filter(Boolean);
  const rightTokens = rightKey.split(" ").filter(Boolean);
  const leftCoreTokens = leftTokens.filter((token) => !SUPPLIER_GENERIC_SUFFIXES.has(token));
  const rightCoreTokens = rightTokens.filter((token) => !SUPPLIER_GENERIC_SUFFIXES.has(token));
  const tokenScore = scoreTokenOverlap(leftCoreTokens, rightCoreTokens, leftTokens, rightTokens);
  const includesScore =
    leftKey.includes(rightKey) || rightKey.includes(leftKey)
      ? Math.min(leftKey.length, rightKey.length) / Math.max(leftKey.length, rightKey.length)
      : 0;
  const acronymScore = scoreAcronymMatch(leftCoreTokens, rightCoreTokens, leftKey, rightKey);
  const distanceScore =
    1 - levenshteinDistance(leftKey, rightKey) / Math.max(leftKey.length, rightKey.length, 1);

  return Math.max(tokenScore, includesScore, acronymScore, distanceScore);
}

export function findBestSupplierMergeTarget(
  sourceName: string,
  candidateNames: Array<string>,
  excludedSupplierName?: string | null,
) {
  const sourceKey = normalizeSupplierSelectionKey(sourceName);
  const excludedKey = excludedSupplierName ? normalizeSupplierSelectionKey(excludedSupplierName) : null;

  if (!sourceKey) {
    return null;
  }

  let bestMatch: { supplierName: string; normalizedSupplierName: string; score: number } | null = null;

  for (const candidateName of candidateNames) {
    const normalizedCandidateName = normalizeSupplierSelectionKey(candidateName);

    if (!normalizedCandidateName || normalizedCandidateName === sourceKey) {
      continue;
    }

    if (excludedKey && normalizedCandidateName === excludedKey) {
      continue;
    }

    const score = scoreSupplierNameMatch(sourceKey, normalizedCandidateName);

    if (score <= 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        supplierName: canonicalizeSupplierDisplayName(candidateName),
        normalizedSupplierName: normalizeSupplierName(candidateName),
        score,
      };
    }
  }

  return bestMatch && bestMatch.score >= 0.82 ? bestMatch : null;
}

function scoreTokenOverlap(
  leftCoreTokens: string[],
  rightCoreTokens: string[],
  leftTokens: string[],
  rightTokens: string[],
) {
  const sharedTokens = new Set(leftCoreTokens.filter((token) => rightCoreTokens.includes(token)));
  const coreScore = sharedTokens.size / Math.max(leftCoreTokens.length, rightCoreTokens.length, 1);

  if (coreScore > 0) {
    return coreScore;
  }

  const sharedAllTokens = new Set(leftTokens.filter((token) => rightTokens.includes(token)));
  return sharedAllTokens.size / Math.max(leftTokens.length, rightTokens.length, 1);
}

function scoreAcronymMatch(
  leftCoreTokens: string[],
  rightCoreTokens: string[],
  leftKey: string,
  rightKey: string,
) {
  const leftAcronym = buildAcronym(leftCoreTokens);
  const rightAcronym = buildAcronym(rightCoreTokens);

  if (!leftAcronym || !rightAcronym) {
    return 0;
  }

  if (leftAcronym === rightKey || rightAcronym === leftKey) {
    return 0.98;
  }

  if (leftAcronym === rightAcronym) {
    return 0.92;
  }

  return 0;
}

function buildAcronym(tokens: string[]) {
  return tokens.map((token) => token.charAt(0)).join("");
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const rows = Array.from({ length: left.length + 1 }, (_, rowIndex) =>
    Array.from({ length: right.length + 1 }, (_, columnIndex) =>
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0,
    ),
  );

  for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
      const cost = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1;
      rows[rowIndex][columnIndex] = Math.min(
        rows[rowIndex - 1][columnIndex] + 1,
        rows[rowIndex][columnIndex - 1] + 1,
        rows[rowIndex - 1][columnIndex - 1] + cost,
      );
    }
  }

  return rows[left.length][right.length];
}
