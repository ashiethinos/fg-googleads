export type ParsedGaql = {
  select: string[];
  from: string;
  where: GaqlCondition[];
  orderBy: { field: string; direction: "ASC" | "DESC" } | null;
  limit: number | null;
  hasDateSegment: boolean;
};

export type GaqlCondition = {
  field: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "IN" | "DURING" | "CONTAINS";
  value: string | number | string[];
};

const FIELD_ALIASES: Record<string, string> = {
  "customer.id": "customer.id",
  "customer.descriptive_name": "customer.descriptive_name",
  "customer.manager": "customer.manager",
  "customer.test_account": "customer.test_account",
  "customer.currency_code": "customer.currency_code",
  "customer_client.client_customer": "customer_client.client_customer",
  "customer_client.descriptive_name": "customer_client.descriptive_name",
  "customer_client.manager": "customer_client.manager",
  "customer_client.status": "customer_client.status",
  "customer_client.level": "customer_client.level",
  "customer_client.test_account": "customer_client.test_account",
  "customer_client.hidden": "customer_client.hidden",
  "campaign.id": "campaign.id",
  "campaign.name": "campaign.name",
  "campaign.status": "campaign.status",
  "campaign.advertising_channel_type": "campaign.advertising_channel_type",
  "asset_group.id": "asset_group.id",
  "asset_group.name": "asset_group.name",
  "asset_group.status": "asset_group.status",
  "metrics.impressions": "metrics.impressions",
  "metrics.clicks": "metrics.clicks",
  "metrics.cost_micros": "metrics.cost_micros",
  "metrics.conversions": "metrics.conversions",
  "metrics.conversions_value": "metrics.conversions_value",
  "metrics.average_cpc": "metrics.average_cpc",
  "metrics.ctr": "metrics.ctr",
  "segments.product_item_id": "segments.product_item_id",
  "segments.product_title": "segments.product_title",
  "segments.date": "segments.date",
};

function normalizeField(field: string): string {
  const trimmed = field.trim().toLowerCase();
  return FIELD_ALIASES[trimmed] ?? trimmed;
}

function parseWhereClause(whereStr: string): GaqlCondition[] {
  const conditions: GaqlCondition[] = [];
  const parts = whereStr.split(/\s+AND\s+/i);

  for (const part of parts) {
    const trimmed = part.trim();

    const duringMatch = trimmed.match(/^([\w.]+)\s+DURING\s+(\w+)/i);
    if (duringMatch) {
      conditions.push({ field: "segments.date", operator: "DURING", value: duringMatch[2] });
      continue;
    }

    // IN ('a', 'b', ...) or IN (1, 2, ...)
    const inMatch = trimmed.match(/^([\w.]+)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const values = inMatch[2]
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""));
      conditions.push({ field: normalizeField(inMatch[1]), operator: "IN", value: values });
      continue;
    }

    // All comparison operators — <=, >=, != must come before <, >, =
    const cmpMatch = trimmed.match(
      /^([\w.]+)\s*(<=|>=|!=|<|>|=)\s*(\d+(?:\.\d+)?|"[^"]*"|'[^']*'|\w+)/i,
    );
    if (cmpMatch) {
      const op = cmpMatch[2] as GaqlCondition["operator"];
      let value: string | number = cmpMatch[3].replace(/^["']|["']$/g, "");
      if (/^\d+(?:\.\d+)?$/.test(String(value))) value = Number(value);
      conditions.push({ field: normalizeField(cmpMatch[1]), operator: op, value });
    }
  }

  return conditions;
}

export function parseGaql(query: string): ParsedGaql {
  const normalized = query.replace(/\s+/g, " ").trim();

  const selectMatch = normalized.match(/^SELECT\s+(.+?)\s+FROM\s+/i);
  if (!selectMatch) throw new Error("Invalid GAQL: missing SELECT/FROM");

  const afterFrom = normalized.slice(selectMatch[0].length);
  const fromMatch = afterFrom.match(/^(\w+)/i);
  if (!fromMatch) throw new Error("Invalid GAQL: missing FROM resource");

  const from = fromMatch[1].toLowerCase();
  let remainder = afterFrom.slice(fromMatch[0].length).trim();

  const select = selectMatch[1]
    .split(",")
    .map((f) => normalizeField(f.trim()))
    .filter(Boolean);

  let where: GaqlCondition[] = [];
  let orderBy: ParsedGaql["orderBy"] = null;
  let limit: number | null = null;

  const whereMatch = remainder.match(/^WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  if (whereMatch) {
    const whereEnd = remainder.indexOf(whereMatch[0]) + whereMatch[0].length;
    const whereOnly = whereMatch[1]
      .replace(/\s+ORDER\s+BY\s+.+$/i, "")
      .replace(/\s+LIMIT\s+\d+$/i, "")
      .trim();
    where = parseWhereClause(whereOnly);
    remainder = remainder.slice(whereEnd).trim();
    if (remainder.toUpperCase().startsWith("WHERE")) {
      remainder = remainder.replace(/^WHERE\s+.+?(?=ORDER\s+BY|LIMIT|$)/i, "").trim();
    }
  }

  const orderMatch = normalized.match(/ORDER\s+BY\s+([\w.]+)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    orderBy = {
      field: normalizeField(orderMatch[1]),
      direction: (orderMatch[2]?.toUpperCase() as "ASC" | "DESC") || "ASC",
    };
  }

  const limitMatch = normalized.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) limit = Number(limitMatch[1]);

  const hasDateSegment = select.includes("segments.date") || where.some((c) => c.field === "segments.date");

  return { select, from, where, orderBy, limit, hasDateSegment };
}

export function toCamelCaseApi(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[camel] = toCamelCaseApi(value as Record<string, unknown>);
    } else {
      result[camel] = value;
    }
  }
  return result;
}

export function microsFromSpend(spend: number): string {
  return String(Math.round(spend * 1_000_000));
}
