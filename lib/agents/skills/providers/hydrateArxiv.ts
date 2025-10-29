import type { HydratedContent, HydrationResult } from "../types";

export interface HydrateArxivOptions {
  providerId: string;
  fetcher?: typeof fetch;
}

export async function hydrateArxiv(options: HydrateArxivOptions): Promise<HydrationResult> {
  const { providerId } = options;
  const fetcher = options.fetcher ?? fetch;

  const api = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(providerId)}`;
  const res = await fetcher(api);

  if (!res.ok) {
    return { status: "skipped", reason: `arXiv request failed with status ${res.status}` };
  }

  const xml = await res.text();
  const title = matchTag(xml, "title") ?? "arXiv paper";
  const summary = matchTag(xml, "summary") ?? "";

  const content: HydratedContent = {
    provider: "arxiv",
    providerId,
    title,
    text: summary.trim(),
    raw: { xml },
  };

  return { status: "ok", content };
}

function matchTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

