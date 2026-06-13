import type { GaqlCondition, ParsedGaql } from "./parser.js";
import { gaqlFieldToFieldMask } from "./field-mask.js";

/** Stored metrics represent ~30 days of activity. */
const BASE_DAYS = 30;

const DATE_RANGE_DAYS: Record<string, number> = {
  TODAY: 1,
  YESTERDAY: 1,
  LAST_7_DAYS: 7,
  LAST_14_DAYS: 14,
  LAST_30_DAYS: 30,
  LAST_90_DAYS: 90,
  THIS_MONTH: 30,
  LAST_MONTH: 30,
  THIS_WEEK_SUN_TODAY: 7,
  THIS_WEEK_MON_TODAY: 7,
  LAST_WEEK_SUN_SAT: 7,
  LAST_WEEK_MON_SUN: 7,
};

/**
 * Return a 0–1 scaling factor for the DURING range in the WHERE conditions.
 * Queries without a DURING clause get 1.0 (unscaled).
 */
export function dateRangeMultiplier(conditions: GaqlCondition[]): number {
  const during = conditions.find((c) => c.field === "segments.date" && c.operator === "DURING");
  if (!during) return 1;
  const days = DATE_RANGE_DAYS[String(during.value).toUpperCase()] ?? BASE_DAYS;
  return Math.min(1, days / BASE_DAYS);
}

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
