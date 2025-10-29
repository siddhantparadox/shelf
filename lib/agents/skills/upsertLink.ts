import type { SkillDefinition } from "../executor";
import type { HydratedContent, ParsedUrlInfo, PersistLinkInput, SupportedProvider } from "./types";

export const upsertLinkSkill: SkillDefinition = {
  name: "upsert_link",
  run: (_, context) => {
    const urlInfo = context.state.urlInfo as ParsedUrlInfo | undefined;
    if (!urlInfo) {
      throw new Error("upsert_link requires urlInfo in state");
    }

    if (urlInfo.provider === "unknown") {
      throw new Error("Cannot upsert link for unknown provider");
    }

    const hydrated = context.state.hydratedContent as HydratedContent | undefined;

    const payload: PersistLinkInput = {
      linkId: (context.state.linkId as string | undefined) ?? context.task.linkId,
      url: urlInfo.normalized,
      provider: urlInfo.provider as SupportedProvider,
      providerId: urlInfo.providerId,
      domain: urlInfo.domain,
      title: hydrated?.title,
      text: hydrated?.text,
      raw: hydrated?.raw,
      note: (context.state.note as string | undefined) ?? context.task.note,
    };

    context.state.persistLink = payload;
    return payload;
  },
};

