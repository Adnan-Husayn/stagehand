# Stagehand

Stagehand is a booking and promotion agent for independent music venues, built for the Qloo Agentic Hackathon. A booker at a 300-capacity room usually guesses which touring acts will sell in town and how to market the show. Stagehand answers both from Qloo's taste data.

Enter a city and, optionally, up to five artists that sold well for you. An agent makes Qloo calls and returns a ranked shortlist, each artist with the Qloo evidence behind it. For an artist you pick, it builds a promo plan: the local places, brands, podcasts, films and TV shows that artist's fans over-index on, suggested ad audiences, and two draft emails. It is for venue bookers and small promoters who book their own shows.

## Why it needs Qloo

Stagehand's output is a set of taste relationships: which artists over-index with a city's places, and which brands and media their fans favour. A language model can write plausible names, but it has no measured overlap to draw on. Without Qloo the shortlist would be guesses and the partner list invented.

## How Qloo is used

| Step | Call | Purpose |
|---|---|---|
| Resolve city | `/search`, type `locality` | City to locality id |
| Local places | `/search`, type `place`, `filter.location` | Local taste signals |
| Seed artists | `/search`, type `artist` | Seed names to artist ids |
| Local shortlist | `/v2/insights`, artists, place ids | Artists over-indexing with local audiences |
| Seed shortlist | `/v2/insights`, artists, seed ids | Artists over-indexing with seed fans |
| Overlap | Two insights calls, compared locally | Artists in both audiences |
| Cross-domain promo | `/v2/insights` per brand, podcast, movie or tv_show, artist id | Partner candidates |
| Local promo | `/v2/insights`, places, `filter.location`, artist id | Local partner candidates |

Exact parameters and unverified items are in [`docs/QLOO_NOTES.md`](docs/QLOO_NOTES.md).

## How the agent works

The browser posts to `POST /api/agent` and receives trace events and the result as server-sent events. The language model the agent runs on chooses the tools and their order. The search and insights tools call Qloo through a typed client, and every tool call appears in the Agent activity panel as it happens.

Two submit tools end a run. `submit_shortlist` returns 3 to 8 artists for a city. `submit_promo_plan` returns 3 to 6 partners and 2 to 5 ad targets for one artist. Each submit checks its input against the same run's results and rejects any id it did not receive. Evidence chips are built from those Qloo responses, not from model text.

- **Seed exclusion.** Seed artists are never recommended back. Their ids go to Qloo as `filter.exclude.entities` on artist calls, and `submit_shortlist` also rejects them by id or normalised name.
- **Local place fallback.** Lookups try the locality id, then the city name with its region, then the city name alone. Place search adds a text search last. The activity trace shows which strategy worked.

**Demo mode** runs when `QLOO_API_KEY` or `ANTHROPIC_API_KEY` is missing. It runs the same tools and validators on a fixed call sequence with fictional sample data, and a banner says so.

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
| `ANTHROPIC_API_KEY` | For live mode | none | Key for the language model the agent runs on, read by `@anthropic-ai/sdk`. |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-5-5` | Any model id your key can use. |
| `DEBUG_QLOO` | No | unset | Set to `1` to log response key names (never values). Useful on a first live run. |

Keys are read on the server only. `.env*` files are git-ignored except `.env.example`.

## Scripts and tests

`npm run dev`, `npm run build`, `npm run typecheck` (`tsc --noEmit`), `npm run lint` and `npm test`. The Vitest suite runs offline. It covers the validators, the response normaliser, the local place fallback chain and the demo sequence.

`GET /api/health` returns `{"ok": true}` and reads no configuration. `GET /api/status` reports demo mode and the model name, never keys.

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, import the repository. The Next.js preset needs no build changes.
3. Add `QLOO_API_KEY`, `QLOO_BASE_URL` and `ANTHROPIC_API_KEY` under Environment Variables. Add `ANTHROPIC_MODEL` only to override the default.
4. Deploy. `/api/status` should report `"demo": false`, and `/api/health` should report `"ok": true`.

A live run makes several sequential calls and can take a minute or more. The agent route sets `maxDuration = 300`, the ceiling on Vercel's Hobby plan. Change it in `src/app/api/agent/route.ts`.

## Known limits

- **The live path has not been run** against the Qloo hackathon API or the Anthropic API, so response shapes are unverified. The normaliser accepts several envelopes. Run once with `DEBUG_QLOO=1` to confirm the real one.
- **Some filters are unverified.** Locality-id place filters and city-name geocode parameters are not confirmed for `/search` or artist calls. Qloo ignores invalid parameters, so check the strategy in the activity trace to see whether results are local.
- **The artist location signal is experimental.** Its results are labelled, and an artist found only through it is rejected.
- **Scores come from Qloo.** Stagehand does not compute affinity.
- **Drafts need review.** Emails keep `[placeholders]` for facts the app does not know. Nothing is sent automatically.
- **Rate limits are not stated** in Qloo's docs. A 429 response shows a clear error.
- **No accounts or persistence.** Results exist only in the open browser tab.
- **Qloo data stays out of git.** Stagehand writes no response data to disk. Do not commit real responses.

## License

MIT. See [LICENSE](LICENSE).
