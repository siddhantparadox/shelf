import type { SkillDefinition } from "../executor";
import type { HydrationResult, ParsedUrlInfo, SupportedProvider } from "./types";
import { hydrateArxiv, type HydrateArxivOptions } from "./providers/hydrateArxiv";
import { hydrateReddit, type HydrateRedditOptions } from "./providers/hydrateReddit";
import { hydrateX, type HydrateXOptions } from "./providers/hydrateX";

type ProviderArgs = {
  reddit?: Partial<HydrateRedditOptions>;
  x?: Partial<HydrateXOptions>;
  arxiv?: Partial<HydrateArxivOptions>;
};

export const hydrateProviderSkill: SkillDefinition = {
  name: "hydrate_provider",
  run: async (args, context) => {
    const urlInfo = context.state.urlInfo as ParsedUrlInfo | undefined;
    if (!urlInfo) {
      throw new Error("hydrate_provider requires urlInfo in state");
    }

    if (urlInfo.provider === "unknown") {
      context.logger.warn?.("agent.skill.hydrate_provider.unknown", { url: urlInfo.raw });
      context.state.hydratedContent = undefined;
      return;
    }

    const providerArgs = (args ?? {}) as ProviderArgs;
    const result = await resolveHydration(urlInfo.provider, urlInfo, providerArgs, context);

    context.state.hydration = result;

    if (result.content) {
      context.state.hydratedContent = result.content;
    } else {
      context.state.hydratedContent = undefined;
    }

    if (result.status === "skipped") {
      context.logger.info?.("agent.skill.hydrate_provider.skipped", {
        provider: urlInfo.provider,
        reason: result.reason,
      });
    }

    return result;
  },
};

async function resolveHydration(
  provider: SupportedProvider,
  urlInfo: ParsedUrlInfo,
  args: ProviderArgs,
  context: Parameters<SkillDefinition["run"]>[1],
): Promise<HydrationResult> {
  switch (provider) {
    case "reddit": {
      const base: HydrateRedditOptions = {
        url: urlInfo.normalized,
        providerId: urlInfo.providerId,
        accessToken:
          args.reddit?.accessToken ??
          (context.state.credentials as any)?.reddit?.accessToken ??
          process.env.REDDIT_ACCESS_TOKEN,
        userAgent: args.reddit?.userAgent,
        limitComments: args.reddit?.limitComments,
        fetcher: args.reddit?.fetcher,
      };
      return hydrateReddit(base);
    }
    case "x": {
      const providerId = urlInfo.providerId ?? urlInfo.normalized.split("/").pop() ?? "";
      if (!providerId) {
        return { status: "skipped", reason: "Missing X provider identifier" };
      }

      const base: HydrateXOptions = {
        providerId,
        bearerToken:
          args.x?.bearerToken ??
          (context.state.credentials as any)?.x?.bearerToken ??
          process.env.X_BEARER_TOKEN,
        fetcher: args.x?.fetcher,
        embedFetcher: args.x?.embedFetcher,
      };
      return hydrateX(base);
    }
    case "arxiv": {
      const providerId = urlInfo.providerId ?? urlInfo.normalized.split("/").pop() ?? "";
      if (!providerId) {
        return { status: "skipped", reason: "Missing arXiv identifier" };
      }

      const base: HydrateArxivOptions = {
        providerId,
        fetcher: args.arxiv?.fetcher,
      };
      return hydrateArxiv(base);
    }
    default: {
      return { status: "skipped", reason: `Unsupported provider '${provider}'` };
    }
  }
}

