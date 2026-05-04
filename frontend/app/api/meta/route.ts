import { NextResponse } from "next/server";
import { getPythonApiBase } from "@/lib/python-api-base";
import type { FilterOption } from "@/types/game";

const PATH = process.env.PYTHON_API_META_PATH ?? "/meta";

function normalizeRow(row: Record<string, unknown>): FilterOption | null {
  const id =
    toInt(row.id) ??
    toInt(row.mechanic_id) ??
    toInt(row.category_id) ??
    null;
  const name = row.name;
  if (id == null || typeof name !== "string" || !name.trim()) return null;
  const description =
    typeof row.description === "string" ? row.description : null;
  return { id, name, description };
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function normalizeList(arr: unknown): FilterOption[] {
  if (!Array.isArray(arr)) return [];
  const out: FilterOption[] = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const o = normalizeRow(item as Record<string, unknown>);
      if (o) out.push(o);
    }
  }
  return out;
}

export async function GET() {
  const base = getPythonApiBase();
  if (!base) {
    return NextResponse.json({ mechanics: [], categories: [] });
  }

  const path = PATH.startsWith("/") ? PATH : `/${PATH}`;
  const url = `${base}${path}`;

  try {
    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json({ mechanics: [], categories: [] });
    }
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json({
      mechanics: normalizeList(data.mechanics),
      categories: normalizeList(data.categories),
    });
  } catch {
    return NextResponse.json({ mechanics: [], categories: [] });
  }
}
