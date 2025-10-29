import { AgentPlan, AgentTaskRequest, PlanStep, buildPlan } from "./planner";

export type AgentState = Record<string, unknown>;

export interface AgentLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface SkillContext {
  task: AgentTaskRequest;
  plan: AgentPlan;
  step: PlanStep;
  attempt: number;
  maxAttempts: number;
  state: AgentState;
  signal?: AbortSignal;
  logger: AgentLogger;
}

export type SkillHandler = (
  args: PlanStep["args"],
  context: SkillContext,
) => Promise<unknown> | unknown;

export interface SkillDefinition {
  name: string;
  run: SkillHandler;
  maxAttempts?: number;
}

export interface RunPlanOptions {
  logger?: AgentLogger;
  signal?: AbortSignal;
  planOverride?: AgentPlan;
  maxAttempts?: number;
}

export interface RunPlanResult {
  plan: AgentPlan;
  state: AgentState;
}

const skills = new Map<string, SkillDefinition>();

const fallbackLogger: AgentLogger = {
  debug: (message, meta) => console.debug(message, meta),
  info: (message, meta) => console.info(message, meta),
  warn: (message, meta) => console.warn(message, meta),
  error: (message, meta) => console.error(message, meta),
};

export class AgentExecutionError extends Error {
  step: PlanStep;
  attempt: number;
  cause: unknown;

  constructor(step: PlanStep, attempt: number, cause: unknown) {
    const description = step.description ? ` (${step.description})` : "";
    super(`Agent step '${step.use}' failed after attempt ${attempt}${description}`);
    this.name = "AgentExecutionError";
    this.step = step;
    this.attempt = attempt;
    this.cause = cause;
  }
}

export function registerSkill(definition: SkillDefinition): void {
  skills.set(definition.name, definition);
}

export function getRegisteredSkills(): string[] {
  return Array.from(skills.keys());
}

export function clearSkills(): void {
  skills.clear();
}

export async function runPlan(
  request: AgentTaskRequest,
  options: RunPlanOptions = {},
): Promise<RunPlanResult> {
  if (options.signal?.aborted) {
    throw new DOMException("Agent plan aborted", "AbortError");
  }

  const plan = options.planOverride ?? buildPlan(request);
  const logger = options.logger ?? fallbackLogger;
  const state: AgentState = Object.create(null);

  logger.debug?.("agent.plan.generated", { plan, request });

  for (const step of plan.steps) {
    const skill = skills.get(step.use);
    if (!skill) {
      throw new AgentExecutionError(step, 0, new Error(`No skill registered for '${step.use}'`));
    }

    const maxAttempts = skill.maxAttempts ?? options.maxAttempts ?? 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (options.signal?.aborted) {
        throw new DOMException("Agent plan aborted", "AbortError");
      }

      logger.debug?.("agent.step.start", { step: step.use, attempt });

      try {
        await skill.run(step.args, {
          task: request,
          plan,
          step,
          attempt,
          maxAttempts,
          state,
          signal: options.signal,
          logger,
        });

        logger.debug?.("agent.step.success", { step: step.use, attempt });
        break;
      } catch (error) {
        logger.warn?.("agent.step.retry", {
          step: step.use,
          attempt,
          maxAttempts,
          error,
        });

        if (attempt >= maxAttempts) {
          logger.error?.("agent.plan.failed", { step: step.use, attempt, error });
          throw new AgentExecutionError(step, attempt, error);
        }

        await delay(backoffDelay(attempt));
      }
    }
  }

  logger.info?.("agent.plan.completed", { request });

  return { plan, state };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffDelay(attempt: number): number {
  const base = 200;
  return Math.min(2000, base * attempt * attempt);
}

