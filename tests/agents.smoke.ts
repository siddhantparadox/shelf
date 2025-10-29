import { strict as assert } from "node:assert";

import {
  clearSkills,
  registerSkill,
  runPlan,
  type AgentState,
} from "../lib/agents/executor";
import { buildPlan } from "../lib/agents/planner";
import {
  hydrateProviderSkill,
  parseUrlSkill,
  upsertLinkSkill,
} from "../lib/agents/skills";

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function main() {
  clearSkills();

  registerSkill(parseUrlSkill);
  registerSkill(hydrateProviderSkill);
  registerSkill(upsertLinkSkill);
  registerSkill({ name: "upsert_embedding", run: () => undefined });

  const sampleUrl = "https://www.reddit.com/r/webdev/comments/abc123/my_project/";
  const plan = buildPlan({ kind: "hydrate", url: sampleUrl });

  const hydrateStep = plan.steps.find((step) => step.use === "hydrate_provider");
  if (hydrateStep) {
    hydrateStep.args = {
      reddit: {
        accessToken: "token",
        fetcher: createRedditMockFetch(),
      },
    };
  }

  const result = await runPlan(
    { kind: "hydrate", url: sampleUrl },
    { planOverride: plan, logger: silentLogger },
  );

  const state = result.state as AgentState & {
    persistLink?: any;
    hydratedContent?: any;
  };

  assert.ok(state.urlInfo, "parse_url should populate urlInfo in state");
  assert.equal(state.urlInfo.provider, "reddit");

  const hydrated = state.hydratedContent;
  assert.ok(hydrated, "hydrate_provider should place hydratedContent in state");
  assert.equal(hydrated.title, "Sample Reddit Post");
  assert.match(hydrated.text, /Post body/);
  assert.match(hydrated.text, /First comment/);

  const persist = state.persistLink;
  assert.ok(persist, "upsert_link should set persistLink payload");
  assert.equal(persist.provider, "reddit");
  assert.equal(persist.providerId, "abc123");
  assert.equal(persist.title, "Sample Reddit Post");

  console.log("Agent smoke test passed");
}

function createRedditMockFetch(): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/api/info")) {
      return new Response(
        JSON.stringify({
          data: {
            children: [
              {
                data: {
                  id: "abc123",
                  title: "Sample Reddit Post",
                  selftext: "Post body",
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/comments/")) {
      return new Response(
        JSON.stringify([
          {},
          {
            data: {
              children: [
                {
                  data: {
                    body: "First comment",
                  },
                },
                {
                  data: {
                    body: "Second comment",
                  },
                },
              ],
            },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("not found", { status: 404 });
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

