export type AgentTaskKind = "hydrate" | "summarize" | "search";

export interface AgentTaskRequest {
  kind: AgentTaskKind;
  linkId?: string;
  url?: string;
  query?: string;
  note?: string;
}

export interface PlanStep {
  use: string;
  args?: Record<string, unknown>;
  description?: string;
}

export interface AgentPlan {
  version: number;
  createdAt: string;
  steps: PlanStep[];
}

type PlanBuilder = (request: AgentTaskRequest) => PlanStep[];

const PLAN_BUILDERS: Record<AgentTaskKind, PlanBuilder> = {
  hydrate: () => [
    { use: "parse_url", description: "Normalize the URL and detect provider" },
    {
      use: "hydrate_provider",
      description: "Fetch provider-specific content and metadata",
    },
    {
      use: "upsert_link",
      description: "Persist link shell, content payload, and status",
    },
    {
      use: "upsert_embedding",
      description: "Store embeddings for hybrid search",
    },
  ],
  summarize: () => [
    { use: "load_link", description: "Load link and contents for summarization" },
    {
      use: "summarize_on_open",
      description: "Generate or refresh cached summary via LLM",
    },
  ],
  search: () => [
    {
      use: "search_rewrite",
      description: "Rewrite user query into structured intents",
    },
    {
      use: "search_merge",
      description: "Blend hybrid search results",
    },
  ],
};

export class AgentPlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPlanningError";
  }
}

export function buildPlan(request: AgentTaskRequest): AgentPlan {
  if (!request?.kind) {
    throw new AgentPlanningError("Agent task kind is required");
  }

  const builder = PLAN_BUILDERS[request.kind];
  if (!builder) {
    throw new AgentPlanningError(`No plan builder registered for kind '${request.kind}'`);
  }

  const steps = builder(request);
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new AgentPlanningError(`Plan builder for '${request.kind}' produced no steps`);
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    steps,
  };
}

