import type { SkillDefinition } from "../executor";
import type { DetectedProvider, ParsedUrlInfo, SupportedProvider } from "./types";

function inferProvider(domain: string, pathname: string): DetectedProvider {
  const host = domain.toLowerCase();

  if (host.endsWith("reddit.com")) {
    return "reddit";
  }

  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com")) {
    return "x";
  }

  if (host.endsWith("arxiv.org")) {
    return "arxiv";
  }

  // arXiv short IDs like 2301.12345 may come directly
  if (!host.includes(".")) {
    return "arxiv";
  }

  return "unknown";
}

function extractProviderId(provider: DetectedProvider, pathname: string): string | undefined {
  if (provider === "reddit") {
    const match = pathname.match(/\/comments\/([a-z0-9]+)/i);
    return match?.[1];
  }

  if (provider === "x") {
    const match = pathname.match(/\/status(?:es)?\/(\d+)/i);
    return match?.[1];
  }

  if (provider === "arxiv") {
    const match = pathname.match(/\/abs\/([^/]+)/i) ?? pathname.match(/^\/([^/]+)/);
    return match?.[1];
  }

  return undefined;
}

function normalizeUrl(url: URL, provider: DetectedProvider, providerId?: string): string {
  if (provider === "x" && providerId) {
    return `https://x.com/i/web/status/${providerId}`;
  }

  if (provider === "reddit") {
    return `https://www.reddit.com${url.pathname.replace(/\/$/, "")}`;
  }

  if (provider === "arxiv" && providerId) {
    return `https://arxiv.org/abs/${providerId}`;
  }

  return `${url.protocol}//${url.host}${url.pathname}`;
}

export const parseUrlSkill: SkillDefinition = {
  name: "parse_url",
  run: (args, context) => {
    const rawUrl = (args?.url as string | undefined) ?? context.task.url;
    if (!rawUrl) {
      throw new Error("parse_url requires a URL on the task or step args");
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch (error) {
      throw new Error(`Invalid URL provided to parse_url: ${(error as Error).message}`);
    }

    const domain = parsed.hostname.replace(/^www\./, "");
    const provider = inferProvider(domain, parsed.pathname);
    const providerId = extractProviderId(provider, parsed.pathname);
    const normalized = normalizeUrl(parsed, provider, providerId);

    const info: ParsedUrlInfo = {
      raw: rawUrl,
      normalized,
      domain,
      provider,
      providerId,
    };

    context.state.urlInfo = info;

    if (context.task.linkId) {
      context.state.linkId = context.task.linkId;
    }

    if (provider === "unknown") {
      context.logger.warn?.("agent.skill.parse_url.unknown_provider", { rawUrl });
    }

    return info;
  },
};

export type { ParsedUrlInfo };
export type Provider = SupportedProvider;

