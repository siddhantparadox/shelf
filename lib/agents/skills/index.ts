import { registerSkill } from "../executor";
import { hydrateProviderSkill } from "./hydrateProvider";
import { parseUrlSkill } from "./parseUrl";
import { upsertLinkSkill } from "./upsertLink";

export const coreSkills = [parseUrlSkill, hydrateProviderSkill, upsertLinkSkill];

export function registerCoreSkills(): void {
  for (const skill of coreSkills) {
    registerSkill(skill);
  }
}

export * from "./parseUrl";
export * from "./hydrateProvider";
export * from "./upsertLink";
export * from "./types";

