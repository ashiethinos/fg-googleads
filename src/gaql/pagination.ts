const PAGE_SIZE = 10_000;

export function googleAdsPageSize(): number {
  return PAGE_SIZE;
}

export function encodePageToken(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodePageToken(token: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { offset?: number };
    return Number(parsed.offset) || 0;
  } catch {
    return 0;
  }
}

export function paginateResults<T>(rows: T[], pageToken?: string): {
  page: T[];
  nextPageToken?: string;
  offset: number;
} {
  const offset = pageToken ? decodePageToken(pageToken) : 0;
  const page = rows.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const nextPageToken = nextOffset < rows.length ? encodePageToken(nextOffset) : undefined;
  return { page, nextPageToken, offset };
}
