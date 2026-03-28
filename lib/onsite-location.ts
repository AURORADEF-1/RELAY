type LocationShape = {
  location_lat?: number | null;
  location_lng?: number | null;
  location_summary?: string | null;
};

const GENERIC_LOCATION_SUMMARIES = new Set([
  "onsite",
  "onsite request",
  "onsite location",
  "onsite location captured",
]);

export function extractLocationCoordinates(location: LocationShape) {
  if (
    typeof location.location_lat === "number" &&
    typeof location.location_lng === "number"
  ) {
    return {
      lat: location.location_lat,
      lng: location.location_lng,
    };
  }

  const summary = location.location_summary?.trim();

  if (!summary) {
    return null;
  }

  const match = summary.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

export function formatOnsiteLocationSummary(location: LocationShape) {
  const coordinates = extractLocationCoordinates(location);

  if (coordinates) {
    return `Coordinates: ${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
  }

  const summary = location.location_summary?.trim();

  if (!summary) {
    return null;
  }

  if (GENERIC_LOCATION_SUMMARIES.has(summary.toLowerCase())) {
    return null;
  }

  return summary;
}

export function buildOnsiteLocationMapUrl(location: LocationShape) {
  const coordinates = extractLocationCoordinates(location);

  if (coordinates) {
    return `https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`;
  }

  const summary = location.location_summary?.trim();

  if (!summary) {
    return null;
  }

  if (GENERIC_LOCATION_SUMMARIES.has(summary.toLowerCase())) {
    return null;
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(summary)}`;
}
