export type SupportedProvider = "reddit" | "x" | "arxiv";

export type DetectedProvider = SupportedProvider | "unknown";

export interface ParsedUrlInfo {
  raw: string;
  normalized: string;
  domain: string;
  provider: DetectedProvider;
  providerId?: string;
}

export interface HydratedContent {
  provider: SupportedProvider;
  providerId: string;
  title: string;
  text: string;
  raw: unknown;
  embedHtml?: string;
}

export type HydrationResult =
  | { status: "ok"; content: HydratedContent }
  | { status: "skipped"; reason: string; content?: Partial<HydratedContent> };

export interface LinkDraft {
  urlInfo: ParsedUrlInfo;
  note?: string;
}

export interface PersistLinkInput {
  linkId?: string;
  url: string;
  provider: SupportedProvider;
  providerId?: string;
  domain?: string;
  title?: string;
  summary?: string;
  note?: string;
  text?: string;
  raw?: unknown;
}

