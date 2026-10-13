# Stagehand

Stagehand is a booking and promotion agent for independent music venues, built for the Qloo Agentic Hackathon. A booker at a 300-capacity room usually guesses which touring acts will sell in town and how to market the show. Stagehand answers both from Qloo's taste data.

Enter a city and, optionally, up to five artists that sold well for you. An agent makes Qloo calls and returns a ranked shortlist, each artist with the Qloo evidence behind it. For an artist you pick, it builds a promo plan: the local places, brands, podcasts, films and TV shows that artist's fans over-index on, suggested ad audiences, and two draft emails. It is for venue bookers and small promoters who book their own shows.

## Why it needs Qloo

Stagehand's output is a set of taste relationships: which artists over-index with a city's places, and which brands and media their fans favour. A language model can write plausible names, but it has no measured overlap to draw on. Without Qloo the shortlist would be guesses and the partner list invented.

## How Qloo is used

| Step | Call | Purpose |
|---|---|---|
| Resolve city | `/search`, type `locality` | City to locality id and coordinates |
| Local places | `/search`, type `place`, `filter.location` as `lat,lon` | Local taste signals |
| Seed artists | `/search`, type `artist` | Seed names to artist ids |
| Local shortlist | `/v2/insights`, artists, place ids | Artists over-indexing with local audiences |
| Seed shortlist | `/v2/insights`, artists, seed ids | Artists over-indexing with seed fans |
| Overlap | Two insights calls, compared locally | Artists in both audiences |
| Cross-domain promo | `/v2/insights` per brand, podcast, movie or tv_show, artist id | Partner candidates |
| Local promo | `/v2/insights`, places, `filter.location` as the locality id, artist id | Local partner candidates |

Exact parameters, live test results and unverified items are in [`docs/QLOO_NOTES.md`](docs/QLOO_NOTES.md).

## How the agent works

The browser posts to `POST /api/agent` and receives trace events and the result as server-sent events. The language model chooses the tools and their order. It talks to any OpenAI-compatible Chat Completions API over `fetch`, with no provider SDK. The default is Google's Gemini API free tier. The search and insights tools call Qloo through a typed client, and every tool call appears in the Agent activity panel as it happens.

Two submit tools end a run. `submit_shortlist` returns 3 to 8 artists for a city. `submit_promo_plan` returns 3 to 6 partners and 2 to 5 ad targets for one artist. Each submit checks its input against the same run's results and rejects any id it did not receive. Evidence chips are built from those Qloo responses, not from model text.

- **Seed exclusion.** Seed artists are never recommended back. Their ids go to Qloo as `filter.exclude.entities` on artist calls, and `submit_shortlist` also rejects them by id or normalised name.
- **City matching.** Qloo's locality search is fuzzy, so Stagehand accepts a locality only when its name matches the venue's city, and it uses the state or country to choose between cities that share a name.
- **Local place fallback.** Place search filters by the locality's coordinates. If the city has no locality in Qloo, it falls back to a text search and keeps only places whose address names the city. Local place insights filter by the locality id first. The activity trace shows which strategy worked.

**Demo mode** runs when `QLOO_API_KEY` or `LLM_API_KEY` is missing. It runs the same tools and validators on a fixed call sequence with fictional sample data, and a banner says so.

## Setup

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

Without keys the app runs in demo mode.

### Environment variables

| Name | Required | Default | Notes |
|---|---|---|---|
| `QLOO_API_KEY` | For live mode | none | Qloo hackathon key, sent only as the `X-Api-Key` header. |
| `QLOO_BASE_URL` | No | `https://hackathon.api.qloo.com` | Hackathon keys only work on this host. |
| `LLM_API_KEY` | For live mode | none | Key for the model provider, sent as a Bearer token. The default provider is Google's Gemini API. |
| `LLM_BASE_URL` | No | `https://generativelanguage.googleapis.com/v1beta/openai` | Base URL of any OpenAI-compatible API. Stagehand posts to `{base}/chat/completions`. |
| `LLM_MODEL` | No | `gemini-3.5-flash-lite` | Any model id the provider offers that supports tool calling. |
| `LLM_TEMPERATURE` | No | not sent | A number from 0 to 2. When unset, Stagehand sends no temperature and the provider default applies. Google advises leaving Gemini 3 at its default of 1.0. |
| `LLM_THINKING` | No | not sent | `enabled` or `disabled`. Sends DeepSeek's `thinking` switch. Only DeepSeek documents it, so leave it unset for other providers. |
| `DEBUG_QLOO` | No | unset | Set to `1` to log response key names (never values). Useful on a first live run. |

Keys are read on the server only. `.env*` files are git-ignored except `.env.example`.

### Using DeepSeek (paid)

DeepSeek is a paid, low-cost option. Set three values, and add a fourth that I recommend:

```
LLM_API_KEY=<your DeepSeek key>
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
LLM_THINKING=disabled
```

DeepSeek turns thinking on by default, which adds latency and output tokens. With it on, Stagehand still works: it sends each reply's `reasoning_content` back, as DeepSeek requires when tools are in the request. My estimate for one session (a shortlist plus one promo plan) on `deepseek-flash` is 1 to 3 US cents. It is an estimate from assumed token counts, not a measurement. Prices, limits and sources are in [`docs/MODEL_PROVIDERS.md`](docs/MODEL_PROVIDERS.md). Nothing has been run against DeepSeek yet.

### Getting a free model key

The default model needs no payment card.

1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Accept the terms. AI Studio creates a default project and shows a **Create API key** button.
3. Create the key, copy it, and set it as `LLM_API_KEY` in `.env.local`.

Free-tier limits are per project and Google does not publish a per-model table. Open https://aistudio.google.com/rate-limit to see yours. A run makes 8 to 14 model requests. On the free tier Google may use prompts and responses to improve its products, so keep private details out of the venue form.

To use Groq instead, create a key at https://console.groq.com/keys and set `LLM_BASE_URL=https://api.groq.com/openai/v1` and `LLM_MODEL=openai/gpt-oss-120b`. The comparison of providers, with limits and sources, is in [`docs/MODEL_PROVIDERS.md`](docs/MODEL_PROVIDERS.md).

## Scripts and tests

`npm run dev`, `npm run build`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`, `npm test` and `npm run live:check`. The Vitest suite behind `npm test` runs offline. It covers the validators, the response normaliser, the local place fallback chain, the demo sequence, the sample-data Qloo transport, the model client (with a mocked `fetch`), the live-check helpers and an end-to-end run of the live loop with a scripted fake model. `npm run live:check` is separate and sends real requests, so `npm test` never runs it.

### Live model check

This is for developers. It tests the model half of the app against a real provider, so it works without a Qloo key. It uses the real system prompts, the real tools and validators, and the sample-data Qloo transport from demo mode. The real Qloo API is not called.

It does three things:

1. Sends one request per tool list (shortlist and promo) with the full system prompt and every tool schema, and checks that the provider accepts it.
2. Runs the shortlist loop and then the promo loop three times each, printing every turn: the tool called, whether its arguments parsed cleanly or needed repair, the result, and any validator rejection.
3. Prints a table with how many runs gave a valid result, the median model turns, the median seconds, tokens per run if the provider reports them, and the rate-limit headers it saw.

To run it:

1. Put the model key, and nothing else, on the first line of a text file outside the project. I suggest `~/Desktop/GeminiAPIKey.txt` or `~/Desktop/DeepSeekAPIKey.txt`. Delete the file when you are done.
2. Run one of these from the project folder:

```bash
LIVE_LLM=1 LIVE_PROVIDER=gemini LLM_KEY_FILE=~/Desktop/GeminiAPIKey.txt npm run live:check
LIVE_LLM=1 LIVE_PROVIDER=deepseek LLM_KEY_FILE=~/Desktop/DeepSeekAPIKey.txt npm run live:check
```

The script reads the key from the file. It never prints or saves it, and you should not put it on the command line. Without `LIVE_LLM=1` the test is skipped.

| Variable | Default | Meaning |
|---|---|---|
| `LIVE_LLM` | unset | Must be `1`, or the check is skipped. |
| `LLM_KEY_FILE` | none | Path to the key file. Required. |
| `LIVE_PROVIDER` | `gemini` | `gemini` or `deepseek`. Sets the base URL, model and thinking switch. |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_THINKING` | from the preset | Override the preset. |
| `LIVE_RUNS` | 3 | Runs per loop. Use 2 on a model with a small daily quota. |
| `LIVE_MAX_REQUESTS` | 80 | Hard cap on model requests, retries included. The check stops at the cap. |
| `LIVE_MIN_INTERVAL_MS` | 4000 | Minimum gap between requests. |
| `LIVE_DAILY_REQUESTS` | unset | Your daily request quota. When set, the summary estimates sessions per day. |

A passing run shows `accepted` for both schema requests, `outcome: VALID` for most runs, a summary table, and a last line of `LIVE CHECK PASSED`. It passes when the provider accepts the schemas and at least two thirds of the runs of each kind give a valid result. A full default run sends roughly 50 to 70 requests with a good model and takes several minutes at 4 seconds apart. The check stops early if the provider reports that the daily quota is used up.

The seconds in the table leave out the waiting this tool adds between requests, so they are comparable to a deployed run. The deployed function stops at 300 seconds.

`GET /api/health` returns `{"ok": true}` and reads no configuration. `GET /api/status` reports demo mode and the model name, never keys.

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, import the repository. The Next.js preset needs no build changes.
3. Add `QLOO_API_KEY`, `QLOO_BASE_URL` and `LLM_API_KEY` under Environment Variables. Add `LLM_BASE_URL` and `LLM_MODEL` only to override the defaults.
4. Deploy. `/api/status` should report `"demo": false`, and `/api/health` should report `"ok": true`.

A live run makes several sequential calls and can take a minute or more. The agent route sets `maxDuration = 300`, the ceiling on Vercel's Hobby plan. Change it in `src/app/api/agent/route.ts`.

## Known limits

- **Live testing is recent and small.** The live path was first run against the Qloo hackathon API on 14 October 2026, with DeepSeek's `deepseek-flash` as the model. Shortlist and promo runs finished for Asheville, Marfa, Portland (Maine) and Hebden Bridge, each in 15 to 35 seconds with 8 to 12 model calls. That is a handful of runs. `docs/QLOO_NOTES.md` lists what the live API returned.
- **Other models are untested.** Gemini and Groq have not been run with Stagehand's tool schemas. The cost of a DeepSeek run was not measured. The figure in the docs is an estimate from assumed token counts.
- **Small towns can be missing from Qloo.** When a city has no locality, Stagehand works from places whose address names the city and from the seed artists. When Qloo has no city, no places and no seed artists, the run stops with a message that says so.
- **Local and seed audiences often do not overlap.** In the test runs `compare_audiences` usually found no shared artists between the local-place results and the seed results, so most shortlists leaned on the seed run.
- **The artist location signal is experimental.** Its results are labelled, and an artist found only through it is rejected.
- **Scores come from Qloo.** Stagehand does not compute affinity.
- **Drafts need review.** Emails keep `[placeholders]` for facts the app does not know. Nothing is sent automatically.
- **Qloo rate limits.** The hackathon key's response headers report 5 requests per second and 10,000 per month. On a 429 the client waits about a second and retries once, then shows a clear error. Repeated calls within 10 minutes are served from an in-memory cache.
- **Free models are weaker at tool calling.** Stagehand repairs malformed arguments, sends one reminder if the model answers in plain text, and rejects a submit that comes before any Qloo call. A small model can still fail a run. Try again, or set `LLM_MODEL` to a stronger one.
- **Free tiers are rate limited.** On HTTP 429 the client retries up to three times, waiting at most about 20 seconds in total, then shows "model provider is rate limited". A free daily quota that runs out stays out until the provider resets it.
- **Model requests time out after 60 seconds.** Google may use free-tier prompts to improve its products.
- **Temperature is not sent by default.** Google advises leaving Gemini 3 at its default. If a model makes sloppy tool arguments, set `LLM_TEMPERATURE` and compare with the live check.
- **The sample-data Qloo transport is lenient.** It answers any well-formed call with fictional data, so it cannot show whether Qloo's real filters work.
- **No accounts or persistence.** Results exist only in the open browser tab.
- **Qloo data stays out of git.** Stagehand writes no response data to disk. Do not commit real responses.

## License

MIT. See [LICENSE](LICENSE).
