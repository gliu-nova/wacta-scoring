import { api, esc } from "/js/ui.js";

export const HL_CLASS = "bg-amber-100 ring-2 ring-inset ring-amber-400";
export const HL_INPUT = "ring-2 ring-amber-400 bg-amber-50";

export async function fetchActivityFromUrl() {
  const id = new URLSearchParams(location.search).get("activity");
  if (!id) return null;
  try {
    return await api("/activity/" + id);
  } catch {
    return null;
  }
}

export function cellHighlight(highlights, row, cell) {
  if (!highlights?.length) return "";
  for (const h of highlights) {
    if (h.row === String(row) && h.cells?.includes(cell)) return HL_CLASS;
  }
  return "";
}

export function fieldHighlight(highlights, row, field) {
  if (!highlights?.length) return "";
  for (const h of highlights) {
    if (h.row === String(row) && h.fields?.includes(field)) return HL_INPUT;
  }
  return "";
}

export function rowHighlight(highlights, row, cell = "name") {
  return cellHighlight(highlights, row, cell);
}

export function renderChangeBanner(activity) {
  if (!activity?.details?.subtitle) return "";
  return `<div class="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">
    <span class="font-medium text-amber-900">What changed: </span>
    <span class="text-amber-800">${esc(activity.details.subtitle)}</span>
    ${activity.username ? `<span class="text-amber-600 text-xs block mt-1">by ${esc(activity.username)}</span>` : ""}
  </div>`;
}