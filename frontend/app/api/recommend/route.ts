import { NextResponse } from "next/server";
import { getPythonApiBase } from "@/lib/python-api-base";

const PATH = process.env.PYTHON_API_RECOMMEND_PATH ?? "/recommend";

export async function POST(request: Request) {
  const base = getPythonApiBase();
  if (!base) {
    return NextResponse.json(
      {
        error:
          "Не задан PYTHON_API_URL в окружении (URL вашего API на Render).",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const url = `${base}${PATH.startsWith("/") ? PATH : `/${PATH}`}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Сеть";
    return NextResponse.json(
      { error: `Не удалось обратиться к API: ${message}` },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json(
      {
        error: "Бэкенд вернул не-JSON",
        detail: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  return NextResponse.json(data, { status: upstream.status });
}
