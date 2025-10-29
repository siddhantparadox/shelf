import type { HydratedContent, HydrationResult } from "../types";

export interface HydrateXOptions {
  providerId: string;
  bearerToken?: string;
  fetcher?: typeof fetch;
  embedFetcher?: typeof fetch;
}

const OEMBED_ENDPOINT = "https://publish.twitter.com/oembed";

export async function hydrateX(options: HydrateXOptions): Promise<HydrationResult> {
  const { providerId } = options;
  const fetcher = options.fetcher ?? fetch;
  const bearer = options.bearerToken ?? process.env.X_BEARER_TOKEN;

  if (bearer) {
    const url = `https://api.x.com/2/tweets?ids=${providerId}&tweet.fields=created_at,author_id,public_metrics`;
    const res = await fetcher(url, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

    if (res.ok) {
      const json = await res.json();
      const tweet = json?.data?.[0];
      if (tweet) {
        const text = typeof tweet.text === "string" ? tweet.text : "";
        const title = text.split("\n")[0]?.slice(0, 120) || "Post on X";
        const content: HydratedContent = {
          provider: "x",
          providerId,
          title,
          text,
          raw: json,
        };

        return { status: "ok", content };
      }
    }
  }

  const embedFetcher = options.embedFetcher ?? fetcher;
  const embedUrl = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(`https://x.com/i/web/status/${providerId}`)}`;
  const embedRes = await embedFetcher(embedUrl);

  if (!embedRes.ok) {
    return { status: "skipped", reason: "Unable to fetch X oEmbed payload" };
  }

  const oembed = await embedRes.json();
  const content: HydratedContent = {
    provider: "x",
    providerId,
    title: "Post on X",
    text: "",
    raw: { oembed },
    embedHtml: typeof oembed?.html === "string" ? oembed.html : undefined,
  };

  return {
    status: "skipped",
    reason: "No bearer token provided for X API; falling back to oEmbed",
    content,
  };
}

