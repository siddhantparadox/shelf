import type { HydratedContent, HydrationResult } from "../types";

export interface HydrateRedditOptions {
  url: string;
  providerId?: string;
  accessToken?: string;
  userAgent?: string;
  limitComments?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_USER_AGENT = "shelf/0.1";

export async function hydrateReddit(options: HydrateRedditOptions): Promise<HydrationResult> {
  const {
    url,
    providerId,
    accessToken,
    userAgent = DEFAULT_USER_AGENT,
    limitComments = 5,
  } = options;

  const fetcher = options.fetcher ?? fetch;

  if (!accessToken) {
    return { status: "skipped", reason: "Missing Reddit OAuth access token" };
  }

  const headers = {
    Authorization: `bearer ${accessToken}`,
    "User-Agent": userAgent,
  } satisfies Record<string, string>;

  const infoUrl = `https://oauth.reddit.com/api/info?url=${encodeURIComponent(url)}`;
  const infoRes = await fetcher(infoUrl, { headers });

  if (!infoRes.ok) {
    return {
      status: "skipped",
      reason: `Reddit info request failed with status ${infoRes.status}`,
    };
  }

  const infoJson = await infoRes.json();
  const post = infoJson?.data?.children?.[0]?.data as Record<string, unknown> | undefined;

  if (!post) {
    return { status: "skipped", reason: "No Reddit post found for URL" };
  }

  const id = (post.id as string | undefined) ?? providerId;
  if (!id) {
    return { status: "skipped", reason: "Unable to resolve Reddit post id" };
  }

  const title = (post.title as string | undefined) ?? "Reddit post";
  const selftext = ((post.selftext as string | undefined) ?? "").trim();
  let comments: unknown = null;

  if (limitComments > 0) {
    try {
      const commentsUrl = `https://oauth.reddit.com/comments/${id}?limit=${limitComments}&depth=1`;
      const commentsRes = await fetcher(commentsUrl, { headers });
      if (commentsRes.ok) {
        comments = await commentsRes.json();
      }
    } catch (error) {
      comments = { error: (error as Error).message };
    }
  }

  const topBodies: string[] = Array.isArray((comments as any)?.[1]?.data?.children)
    ? ((comments as any)[1].data.children as unknown[])
        .map((child) => (child as any)?.data?.body)
        .filter((body: unknown): body is string => typeof body === "string")
        .map((body) => body.trim())
        .filter((body) => body.length > 0)
        .slice(0, Math.max(0, limitComments))
    : [];

  const textParts = [selftext, ...topBodies].filter((part) => part.length > 0);

  const content: HydratedContent = {
    provider: "reddit",
    providerId: id,
    title,
    text: textParts.join("\n\n"),
    raw: {
      post,
      comments,
    },
  };

  return { status: "ok", content };
}

