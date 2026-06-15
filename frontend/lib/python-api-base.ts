export function getPythonApiBase(): string | null {
  const raw = process.env.PYTHON_API_URL;
  if (!raw?.trim()) return null;
  return raw.replace(/\/$/, "");
}
