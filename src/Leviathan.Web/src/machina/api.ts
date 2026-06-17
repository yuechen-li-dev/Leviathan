import { joinApiUrl } from "./apiConfig";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(joinApiUrl(path), {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
