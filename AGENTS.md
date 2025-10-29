```markdown
# Shelf
Save links. See the real content. Add notes. Search with natural language.  
Web first. Next.js. Supabase. Grok 4 Fast for LLM. OpenAI text embedding 3 small for vectors.

Key references  
- OpenRouter chat completions, streaming with `stream: true` and app headers. :contentReference[oaicite:0]{index=0}  
- OpenRouter web search feature with `:online` and the `web` plugin. Uses Exa for non native engines. :contentReference[oaicite:1]{index=1}  
- Grok 4 Fast model on OpenRouter. :contentReference[oaicite:2]{index=2}  
- OpenAI text embedding 3 small and 1536 dimensions guidance. :contentReference[oaicite:3]{index=3}  
- Supabase pgvector and Postgres full text search. :contentReference[oaicite:4]{index=4}  
- Reddit official API endpoints for info, comments, and morechildren. :contentReference[oaicite:5]{index=5}  
- X API get posts by ids and oEmbed. Plus the 24 hour removal rule. :contentReference[oaicite:6]{index=6}  
- arXiv Atom API with `id_list`. :contentReference[oaicite:7]{index=7}

---

## Problem

You save links from X, GitHub, Instagram, Reddit, arXiv, and more. Notes get messy. You cannot find things. You want exact content, clean tags, a short summary, and a smart search box that speaks plain English.

---

## What we are building

- Only URL based input  
- Show the official embed for Reddit, X, and arXiv  
- Pull exact text from official APIs when allowed  
- Add your notes right away  
- Generate a short summary with Grok 4 Fast  
- Store embeddings with OpenAI text embedding 3 small  
- Hybrid search that blends vectors, keywords, and recency  
- Clean, minimalist UI  
- Web first. Later Android and iOS wrappers

We choose Supabase for auth, storage, FTS, vectors, and policies. It fits all needs. :contentReference[oaicite:8]{index=8}

---

## High level flow

1. Paste a URL and hit Enter  
2. App creates a stub record and routes to the item page right away  
3. A background job detects the provider and calls the official API  
4. We store the text we are allowed to store  
5. We compute an embedding for search  
6. On the item page the summary streams in from Grok and then gets cached

Streaming and the headers for app attribution are first class in OpenRouter. :contentReference[oaicite:9]{index=9}

---

## Architecture

Split by layers to avoid spaghetti

- UI layer in Next.js App Router  
- API routes for ingest, hydrate, summary, search  
- Provider adapters for Reddit, X, arXiv  
- LLM client wrapper and Embedding client wrapper  
- Agents for small tasks, each one does one thing  
- Supabase for tables, vectors, and FTS

Folders

```

/app
page.tsx
link/[id]/page.tsx
/api
ingest/route.ts
hydrate/route.ts
summary/[id]/route.ts
search/route.ts
/lib
db.ts
urlParser.ts
providerClient.ts
providers/
redditProvider.ts
xProvider.ts
arxivProvider.ts
llm.ts
embeddingModel.ts
search.ts
agents/
planner.ts
executor.ts
skills/
hydrateReddit.ts
hydrateX.ts
hydrateArxiv.ts
upsertLink.ts
upsertEmbedding.ts
summarizeOnOpen.ts
searchRewrite.ts
/components
SearchBar.tsx
LinkCard.tsx
EmbedView.tsx
NotesEditor.tsx
StreamText.tsx
/jobs
index.ts

````

Names are generic. You can swap models or providers without renaming files.

---

## Provider strategy

We avoid general scrapers. We use official APIs.

- Reddit  
  - Use OAuth endpoints  
  - Hydrate a post by URL or id via `GET /api/info`  
  - Pull comments with `GET /comments/{article}` and fill deep threads with `GET /api/morechildren`  
  - We store title, selftext, and a small selection of top comments for context  
  - Everything uses the `read` scope and a standard user agent string  
  - docs show these endpoints and scopes :contentReference[oaicite:10]{index=10}

- X  
  - If you have API access, use v2 get posts by ids for full text and metrics  
  - If you do not, show the oEmbed result and do not store the text  
  - Respect the 24 hour removal rule for stored content  
  - docs cover get posts by ids, oEmbed, and the 24 hour rule :contentReference[oaicite:11]{index=11}

- arXiv  
  - Use the Atom API with `id_list`  
  - Store title and abstract for embedding and search  
  - docs explain `id_list` behavior :contentReference[oaicite:12]{index=12}

We will add more providers later. The provider interface stays the same.

---

## Data model

Run on Supabase Postgres with pgvector and FTS.

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;

create table links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  url text not null unique,
  provider text not null,        -- reddit, x, arxiv
  provider_id text,
  domain text,
  title text,
  summary text,
  note text,
  saved_at timestamptz default now(),
  word_count int,
  reading_time_sec int,
  status text default 'pending', -- pending, ready, error
  error text,
  fts tsvector
);

create table contents (
  link_id uuid primary key references links(id) on delete cascade,
  text text,            -- exact content we are allowed to store
  raw jsonb             -- minimal raw payload
);

create table link_embeddings (
  link_id uuid primary key references links(id) on delete cascade,
  model text not null,
  vector vector(1536) not null
);

create index links_fts_idx on links using gin(fts);
create index link_embeddings_idx on link_embeddings using ivfflat (vector vector_cosine_ops) with (lists = 100);

create or replace function links_tsv_update() returns trigger as $$
begin
  new.fts := to_tsvector('simple',
    coalesce(new.title,'') || ' ' ||
    coalesce(new.summary,'') || ' ' ||
    coalesce(new.note,'')
  );
  return new;
end $$ language plpgsql;

create trigger links_fts_tg before insert or update on links
for each row execute function links_tsv_update();
````

Supabase docs cover pgvector setup and Postgres full text search. ([Supabase][1])

---

## Auth and security

* Supabase Auth with Magic Link is enough for alpha
* Enable RLS and write per table policies
* Use service role only in backend jobs

RLS policies

```sql
alter table links enable row level security;
alter table contents enable row level security;
alter table link_embeddings enable row level security;

create policy "links are per user"
  on links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "contents are per user"
  on contents for all
  using (exists (select 1 from links l where l.id = contents.link_id and l.user_id = auth.uid()))
  with check (exists (select 1 from links l where l.id = contents.link_id and l.user_id = auth.uid()));

create policy "embeddings are per user"
  on link_embeddings for all
  using (exists (select 1 from links l where l.id = link_embeddings.link_id and l.user_id = auth.uid()))
  with check (exists (select 1 from links l where l.id = link_embeddings.link_id and l.user_id = auth.uid()));
```

Magic Link and RLS are well covered in Supabase docs. ([Supabase][2])

---

## URL intake

Behavior

* Paste URL and press Enter
* We create a record and route to the item page
* Notes box is live and saves on input
* A job hydrates the content

API route

```ts
// app/api/ingest/route.ts
import { db } from "@/lib/db";
import { parseUrl } from "@/lib/urlParser";
import { runPlan } from "@/lib/agents/executor";

export async function POST(req: Request) {
  const { url, note } = await req.json();
  if (!url) return Response.json({ ok: false, error: "url required" }, { status: 400 });

  const { provider, provider_id, norm, domain } = parseUrl(url);
  const link = await db.createLink({
    user_id: /* from auth */,
    url: norm,
    provider,
    provider_id,
    domain,
    note
  });

  runPlan({ kind: "hydrate", linkId: link.id }).catch(() => {});
  runPlan({ kind: "summarize", linkId: link.id }).catch(() => {}); // you asked for no cost saving

  return Response.json({ ok: true, id: link.id });
}
```

---

## Provider adapters

Each adapter returns `{ provider_id, title, text, raw }`.

Reddit

```ts
// lib/providers/redditProvider.ts
export async function fetchReddit(permalinkOrUrl: string, accessToken: string) {
  const infoUrl = `https://oauth.reddit.com/api/info?url=${encodeURIComponent(permalinkOrUrl)}`;
  const info = await fetch(infoUrl, { headers: { Authorization: `bearer ${accessToken}`, "User-Agent": "shelf/0.1" }});
  const listing = await info.json();
  const post = listing?.data?.children?.[0]?.data;
  const id36 = post?.id;
  const title = post?.title ?? "Reddit post";
  const selftext = post?.selftext ?? "";

  const commentsUrl = `https://oauth.reddit.com/comments/${id36}?limit=10&depth=1`;
  const c = await fetch(commentsUrl, { headers: { Authorization: `bearer ${accessToken}`, "User-Agent": "shelf/0.1" }});
  const cjson = await c.json();
  const topBodies = (cjson?.[1]?.data?.children ?? [])
    .map((x: any) => x?.data?.body?.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n\n");

  const text = [selftext, topBodies].filter(Boolean).join("\n\n");
  return { provider_id: id36, title, text, raw: { post, comments: cjson } };
}
```

Docs list `GET /api/info`, `GET /comments/{article}`, and `GET /api/morechildren` for deep loads. Use OAuth scopes and a proper user agent. ([Reddit][3])

X

```ts
// lib/providers/xProvider.ts
export async function fetchX(urlOrId: string, creds?: { bearer: string }) {
  const id = extractTweetId(urlOrId);

  if (creds?.bearer) {
    const r = await fetch(`https://api.x.com/2/tweets?ids=${id}&tweet.fields=created_at,author_id,public_metrics`, {
      headers: { Authorization: `Bearer ${creds.bearer}` }
    });
    const json = await r.json();
    const text = json?.data?.[0]?.text ?? "";
    const title = text.split("\n")[0]?.slice(0, 120) || "Post on X";
    return { provider_id: id, title, text, raw: json };
  }

  const em = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/i/web/status/${id}`)}`);
  const oembed = await em.json();
  return { provider_id: id, title: "Post on X", text: "", raw: { oembed } };
}
```

If you store X content, keep it fresh. Remove it when the API says it is gone, and within 24 hours of a removal request. ([X Developer][4])

arXiv

```ts
// lib/providers/arxivProvider.ts
export async function fetchArxiv(absUrlOrId: string) {
  const id = absUrlOrId.includes("/abs/")
    ? absUrlOrId.split("/abs/")[1].split(/[?#]/)[0]
    : absUrlOrId;
  const api = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  const res = await fetch(api);
  const xml = await res.text();
  const title = xml.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || "arXiv paper";
  const abstract = xml.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() || "";
  return { provider_id: id, title, text: abstract, raw: { xml } };
}
```

The `id_list` logic is in the arXiv manual. ([arXiv Info][5])

---

## LLM and embeddings

LLM wrapper

```ts
// lib/llm.ts
type Msg = { role: "system" | "user" | "assistant"; content: string };

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function llmStream(messages: Msg[], opts?: { online?: boolean; json?: boolean }) {
  const model = opts?.online ? "x-ai/grok-4-fast:online" : "x-ai/grok-4-fast";
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY!}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Shelf"
    },
    body: JSON.stringify({
      model,
      stream: true,
      response_format: opts?.json ? { type: "json_object" } : undefined,
      messages
    })
  });
  if (!res.ok || !res.body) throw new Error(`llm error ${res.status}`);
  return res.body;
}
```

* Streaming uses `stream: true`
* `HTTP-Referer` and `X-Title` help attribution
* `:online` enables web search via the web plugin under the hood
  Docs cover streaming, headers, and `:online`. ([OpenRouter][6])

Embedding wrapper

```ts
// lib/embeddingModel.ts
export async function embed(text: string) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text })
  });
  const j = await r.json();
  return j.data[0].embedding as number[]; // 1536 dims
}
```

OpenAI docs and cookbook note the model and typical dimension usage. ([OpenAI][7])

---

## Agents

We keep an agent executor that runs small skills. The planner returns simple JSON. The executor runs steps with retries.

Planner example

```json
{
  "steps": [
    { "use": "parse_url" },
    { "use": "hydrate_provider" },
    { "use": "upsert_embedding" },
    { "use": "enqueue_summary" }
  ]
}
```

Skills

* parse_url
* hydrateReddit
* hydrateX
* hydrateArxiv
* upsertLink
* upsertEmbedding
* summarizeOnOpen
* searchRewrite

Each skill is a small module. You can test each in isolation.

---

## Summary generation

We do not defer. We call LLM on ingest and cache the result. On open, we stream the text again if needed to improve UX.

Prompt

```
System
Write a short factual summary. Three to five sentences. Plain language. No emoji.

User
<<<{TEXT}>>>
```

We keep the final text in `links.summary`.

---

## Search

Smart search has five steps

1. Query rewrite with Grok into JSON with `expanded_terms` and optional `site_bias`
2. Embed the original query
3. Full text search on title, summary, and notes
4. Vector similarity on embeddings
5. Blend scores with recency

Rewrite call

```ts
const plan = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY!}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "x-ai/grok-4-fast",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Search planner. Return JSON only as {expanded_terms:[], site_bias:[], must_have:[], nice_to_have:[]}" },
      { role: "user", content: q }
    ],
    temperature: 0.2
  })
});
```

FTS and vectors stay inside Postgres. Supabase docs cover both. ([Supabase][8])

Blend idea

```
score = 0.6 * semantic + 0.3 * keyword + 0.1 * recency
```

SQL examples

```sql
-- keyword
select id, title, summary, ts_rank_cd(fts, plainto_tsquery($1)) as kw, saved_at
from links
where fts @@ plainto_tsquery($1)
order by kw desc
limit 50;

-- vector
select l.id, l.title, l.summary, l.saved_at, 1 - (e.vector <=> $1::vector) as sem
from link_embeddings e
join links l on l.id = e.link_id
order by e.vector <-> $1::vector
limit 50;
```

---

## UI and UX

Keep it clean

* Home page with a single search bar and recent links
* Cards show provider badge, title, summary, and your note
* Item page shows the official embed and your notes editor
* Summary chip shows LLM generated
* Small, quiet affordances only

---

## Notes

* Notes save on input with a small debounce
* Notes are part of FTS
* Show a small edited indicator

---

## Compliance

* Reddit

  * Respect their OAuth terms. Use a proper user agent string. ([Reddit][9])

* X

  * If you store text, you must remove or modify within 24 hours when the content is removed or changed, or when asked by X or the account owner
  * If you run without paid access, render oEmbed and do not store text
  * docs cover the oEmbed endpoint and the policy clause ([X Developer][10])

* arXiv

  * Public API. Be polite with rate limits. Use the Atom feed fields from the manual. ([arXiv Info][11])

---

## Environment

`.env`

```
APP_URL=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_REDIRECT_URI=
X_BEARER_TOKEN=         # optional, if you have paid access
```

---

## API contracts

Ingest

```
POST /api/ingest
Body { url: string, note?: string }
Return { ok: true, id: string }
```

Hydrate

```
POST /api/hydrate
Body { id: string }
Return { ok: true }
```

Summary

```
GET /api/summary/{id}
Return SSE stream or { ok: true, summary: string }
```

Search

```
POST /api/search
Body { q: string }
Return { ok: true, results: Array<{ id, title, summary, score }> }
```

---

## Tests

* Unit test each provider adapter with fixture payloads
* Unit test urlParser for Reddit, X, arXiv
* Unit test search blend
* Integration test the ingest to hydrate to embed pipeline on a test DB
* Contract tests for API routes
* A small page test for streaming summary

---

## Observability

* Log each agent step to console in dev and to Supabase logs in prod
* Store job errors in `links.error`
* Add simple counters for LLM calls and embedding calls
* Optional use of a hosted tracing tool later

---

## Deployment

* Vercel or Cloudflare for the app
* Supabase managed Postgres
* Keep service role keys on the server only
* Set the OpenRouter headers so your app shows up in their analytics and rankings ([OpenRouter][12])

---

## Roadmap

Week one

* Next.js shell and Supabase schema
* Ingest route and item page with notes
* Reddit and arXiv adapters
* X adapter with oEmbed by default
* Embeddings write path
* Hybrid search
* Summary generation and streaming

Week two

* RLS policies and auth flows polished
* Query rewrite and result re rank
* Topic clusters
* Weekly resurfacing email
* Simple settings page

---

## FAQ style notes

Why only official APIs now
So we can show exact content and stay within terms. It also simplifies embeds and reduces site breakage. For general web pages outside Reddit, X, and arXiv, we can add extraction later.

Why Grok 4 Fast
You asked for best available through OpenRouter with speed. The model exists on OpenRouter and supports large context and streaming. ([OpenRouter][13])

How do we ground answers on the web when needed
We can call Grok with `:online` or add the `web` plugin in OpenRouter. The docs explain engines and pricing and that Exa powers non native engines. We will keep this off by default and add a toggle in the UI. ([OpenRouter][14])

Why Supabase
One database handles vectors and FTS. Policies sit in the database. Cleaner than stitching many services. Supabase docs cover both pgvector and FTS end to end. ([Supabase][1])

---

## Prompts appendix

Summary prompt

```
System
Write a short factual summary. Three to five sentences. Plain language.

User
<<<{TEXT}>>>
```

Search planner prompt

```
System
Search planner. Return JSON only as {expanded_terms:[], site_bias:[], must_have:[], nice_to_have:[]}

User
{QUERY}
```

Cluster label prompt

```
System
You name topic clusters for saved links. Return 2 to 4 words only.

User
Top terms
{TERMS}
Examples
- {TITLE_1}
- {TITLE_2}
- {TITLE_3}
```

---

## Done

You can build this now. It stays simple. It stays fast. It stays legal.

Key links, once more

* OpenRouter streaming and headers. ([OpenRouter][6])
* Web search feature and `:online`. ([OpenRouter][14])
* Grok 4 Fast model page. ([OpenRouter][13])
* OpenAI embeddings and 1536 dimensions context. ([OpenAI][7])
* Supabase pgvector and FTS. ([Supabase][1])
* Reddit, X, arXiv official docs used here. ([Reddit][3])

```
```

[1]: https://supabase.com/docs/guides/database/extensions/pgvector?utm_source=chatgpt.com "pgvector: Embeddings and vector similarity"
[2]: https://supabase.com/docs/guides/auth/auth-email-passwordless?utm_source=chatgpt.com "Passwordless email logins | Supabase Docs"
[3]: https://www.reddit.com/dev/api/ "reddit.com: api documentation"
[4]: https://developer.x.com/en/developer-terms/policy?utm_source=chatgpt.com "Developer Policy - Twitter Developer - X"
[5]: https://info.arxiv.org/help/api/user-manual.html?utm_source=chatgpt.com "arXiv API User's Manual"
[6]: https://openrouter.ai/docs/api-reference/streaming?utm_source=chatgpt.com "API Streaming | Real-time Model Responses in OpenRouter"
[7]: https://openai.com/index/new-embedding-models-and-api-updates/?utm_source=chatgpt.com "New embedding models and API updates"
[8]: https://supabase.com/docs/guides/database/full-text-search?utm_source=chatgpt.com "Full Text Search | Supabase Docs"
[9]: https://www.reddit.com/dev/api/oauth/?utm_source=chatgpt.com "reddit.com: api documentation"
[10]: https://developer.x.com/en/docs/x-for-websites/oembed-api?utm_source=chatgpt.com "oEmbed API | Docs | Twitter Developer Platform - X"
[11]: https://info.arxiv.org/help/api/basics.html?utm_source=chatgpt.com "arXiv API Basics"
[12]: https://openrouter.ai/docs/app-attribution?utm_source=chatgpt.com "App Attribution | OpenRouter Documentation"
[13]: https://openrouter.ai/x-ai/grok-4-fast?utm_source=chatgpt.com "Grok 4 Fast - API, Providers, Stats"
[14]: https://openrouter.ai/docs/features/web-search "Web Search | Add Real-time Web Data to AI Model Responses | OpenRouter | Documentation"
