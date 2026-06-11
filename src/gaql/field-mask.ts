/** Convert GAQL snake_case field paths to Google REST fieldMask (camelCase). */
export function gaqlFieldToFieldMask(field: string): string {
  return field
    .split(".")
    .map((part) => part.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))
    .join(".");
}

export function buildFieldMask(select: string[]): string {
  return select.map(gaqlFieldToFieldMask).join(",");
}

/** Pick only fields requested in the GAQL SELECT clause (Google Ads row shape). */
export function filterRowBySelect(row: Record<string, unknown>, select: string[]): Record<string, unknown> {
  if (!select.length) return row;

  const picked: Record<string, unknown> = {};
  for (const field of select) {
    const maskPath = gaqlFieldToFieldMask(field);
    const [resourceKey, ...rest] = maskPath.split(".");
    if (!resourceKey) continue;

    const source = row[resourceKey];
    if (!source || typeof source !== "object") continue;

    if (rest.length === 0) {
      picked[resourceKey] = source;
      continue;
    }

    const nested = pickNested(source as Record<string, unknown>, rest);
    if (nested === undefined) continue;

    picked[resourceKey] = {
      ...(picked[resourceKey] as Record<string, unknown> | undefined),
      ...nested,
    };
  }

  return picked;
}

function pickNested(
  obj: Record<string, unknown>,
  path: string[],
): Record<string, unknown> | undefined {
  if (path.length === 1) {
    const key = path[0];
    if (key in obj) return { [key]: obj[key] };
    return undefined;
  }

  const [head, ...tail] = path;
  const child = obj[head];
  if (!child || typeof child !== "object") return undefined;
  const inner = pickNested(child as Record<string, unknown>, tail);
  if (!inner) return undefined;
  return { [head]: inner };
}
