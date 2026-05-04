import { NextResponse } from "next/server";
import { getPythonApiBase } from "@/lib/python-api-base";

const PATH = process.env.PYTHON_API_GAMES_SEARCH_PATH ?? "/games/search";

export async function GET(request: Request) {
  const base = getPythonApiBase();
  if (!base) {
    return NextResponse.json(
      { error: "PYTHON_API_URL не задан", games: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ games: [] });
  }

  const path = PATH.startsWith("/") ? PATH : `/${PATH}`;
  const url = `${base}${path}?${new URLSearchParams({ q })}`;

  try {
    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        { games: [], error: text.slice(0, 200) },
        { status: 200 },
      );
    }
    const data = text ? JSON.parse(text) : { games: [] };
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ games: [] }, { status: 200 });
  }
}
