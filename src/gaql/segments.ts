import type { ParsedGaql } from "./parser.js";
import { gaqlFieldToFieldMask } from "./field-mask.js";

export function segmentsFromSelect(parsed: ParsedGaql): Record<string, string> | undefined {
  const segmentFields = parsed.select.filter((f) => f.startsWith("segments."));
  if (!segmentFields.length) return undefined;

  const segments: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const field of segmentFields) {
    const key = gaqlFieldToFieldMask(field).split(".")[1];
    if (!key) continue;
    if (key === "date") segments.date = today;
    // product fields are filled by shopping_performance_view executor
  }

  return Object.keys(segments).length ? segments : undefined;
}

export function mergeSegments(
  base: Record<string, string> | undefined,
  extra: Record<string, string>,
): Record<string, string> {
  return { ...base, ...extra };
}
