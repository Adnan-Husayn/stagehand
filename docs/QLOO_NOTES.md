# Qloo API notes for Stagehand

These notes cover the Qloo endpoints Stagehand calls, the parameters it sends, and the response shapes it reads.

Items marked **live** were checked against the hackathon API on 14 October 2026 with a hackathon key. Items marked **docs only** come from Qloo's documentation and were not exercised. Items marked **experimental** are called only on an optional path, and the UI labels them. The sections on fallbacks, scores and unused parameters describe Stagehand's own code.

## Base URL and auth

- Base URL: `https://hackathon.api.qloo.com`. **Live.** Qloo's docs say hackathon keys return 401 on `api.qloo.com` and `staging.api.qloo.com` (docs only).
- Auth: header `X-Api-Key: <key>`. **Live.**
- Methods: GET only. Parameters go in the query string.
- The key is read on the server only and never logged. `DEBUG_QLOO=1` logs response key names and leaves out values.

## What the live API does differently from the docs

Stagehand was first written from the documentation. The first live run showed these differences, and the code now follows the live behaviour.

| Area | Written from the docs | Live behaviour |
|---|---|---|
| `/search` envelope | `{ success, duration, results: [...] }` | `{ results: [...] }` only |
| `/search` with no match | 404 with a "No results" message | 200 with `results: []` |
| `/search` item kind | `type` | `types`, an array such as `["urn:entity:artist"]`. There is no `type` or `subtype`. |
| `/search` `filter.location` | Locality UUID, `lat,lng` or WKT | Only `lat,lon`. A locality UUID gets a 400. |
| `filter.geocode.*` | City-name filter for places | No effect on `/search`, which returned places from other countries. On `/v2/insights` it returned an empty list. Stagehand no longer sends it. |
| `/v2/insights` duration | `results.duration` | Not present |
| Place rating | `rating` | `properties.business_rating` |
| Error bodies | `{ code, reason, message }` | `/search`: `{ error: { reason, message, code, request_id } }`. `/v2/insights`: `{ errors: [{ message, path }] }`. |
| Locality search | Top hit is the city | Fuzzy. "Portland, ME" lists a South Portland neighbourhood and Portland, Oregon first. A town with no locality returns unrelated places that share a word. |
| Rate limits | Not stated | Headers report 5 requests per second and 10,000 per month |

## Endpoints Stagehand calls

### `GET /search`: entity lookup (locality, seed artists, local places)

- **Response (live):** `{ "results": [ ... ] }`. An empty array means nothing matched.
- **Item fields (live):** `name`, `entity_id`, `types[]`, `properties`, `popularity`, `disambiguation`, `tags`, and `location: { lat, lon }` on localities and places. `disambiguation` is the parent regions for a locality ("Asheville, Buncombe, North Carolina, United States of America") and the street address for a place.
- **Errors (live):** a 400 carries `error.message`, for example "filter.location: must be in the form lat,lon".

| Param | Used as | Status |
|---|---|---|
| `query` | Name, locality, or place category. Never empty. | Live |
| `types` | One URN: `urn:entity:artist`, `brand`, `locality`, `movie`, `place`, `podcast` or `tv_show`. | Live for `locality`, `artist` and `place`. Docs only for the rest. |
| `filter.location` | `lat,lon` of the resolved locality. | Live. Results were all in or near the city. |
| `filter.radius` | Miles. Stagehand sends 10. | Sent on live calls. The unit and the effect were not measured. |
| `take` | Stagehand sends at most 50. | Live |

Not used: `filter.geocode.*`, `filter.popularity`, `filter.tags`, `page` and `sort_by`.

### `GET /v2/insights`: over-indexing recommendations

- **Response (live):** `{ "success": true, "results": { "entities": [ ... ] } }`.
- **Item fields (live):** `name`, `entity_id`, `type` (always `"urn:entity"`), `subtype` (for example `"urn:entity:artist"`), `properties`, `popularity`, `tags`, `disambiguation`, `external`, and `query.affinity` when the request had a signal. A request with only a location filter returns no `query.affinity`. The kind is read from `subtype`.
- **Errors (live):** a request with no signal or filter gets a 400 with `errors[0].message` "at least one valid signal or filter is required for entity insights". Signal ids of an unusable kind get a 400 that says all of them were invalid.
- **Speed (live):** artist calls took 3.3 to 4.4 seconds. Brand, podcast, movie, TV show and place calls took 0.5 to 2.7 seconds.

| Param | Used as | Status |
|---|---|---|
| `filter.type` | The entity kind. | Live for artist, place, brand, podcast, movie and tv_show. |
| `signal.interests.entities` | Comma-separated Qloo ids: seed artists, local places, or the promo artist. | Live with artist ids, place ids and a mix of both. |
| `filter.exclude.entities` | Seed artist ids on artist calls, comma-separated. | Live. The excluded artists left the results. The shortlist validator also rejects seeds. |
| `filter.location` | Locality UUID for `filter.type=place`. Also a WKT point, `POINT(lon lat)`. | Live for both forms. |
| `filter.location.query` | The venue's city as text, used only when no locality or point is known. | Live, with a caveat: Qloo resolves the text with the same fuzzy locality search, so it can pick another town. Stagehand keeps only places whose address names the city. |
| `signal.location.query` | **Experimental.** The venue's city on artist calls. | Live: it returned artists for Asheville and Marfa and none for Portland (Maine) or Hebden Bridge. Whether the results reflect local taste was not assessed. Used only by `get_location_insights`. Its evidence chip still reads "location signal (unconfirmed for artists)", and an artist found only this way is rejected. |
| `take` | 1 to 50, default 20. | Live |

Brand results can list the same brand name twice under two ids.

## Choosing the locality

`resolve_city` asks `/search` for ten localities and picks one in code (`src/lib/agent/locality.ts`):

1. A locality whose name equals the city name and whose `disambiguation` names the region the venue gave. US state codes are expanded, so "ME" matches "Maine".
2. A locality whose longer name contains the city and sits in that region. Qloo files Athens, Georgia as "Athens-Clarke County Unified Government".
3. The first locality whose name equals the city name.

If the first search has no pick and the city has a region part, the bare city name is searched once more. If there is still no pick, `resolve_city` fails with a message and the run carries on without a locality.

## Local place fallback chain

**Live.** Local places try these strategies in order and stop at the first non-empty result.

`find_local_places` (`/search`):

1. `locality-point`: `filter.location` set to the locality's `lat,lon` with a 10 mile radius. Only if coordinates are known.
2. `text-search`: the query plus the city text, keeping only places whose address names the city.
3. `city-search`: the bare city name as the query, with the same address check.

When no locality resolved, the first place found this way lends its coordinates to later calls. Hebden Bridge has no locality in Qloo, and this is how its second place search became a coordinate search.

`get_insights` with `local_only` (`/v2/insights`, places):

1. `locality-id`: `filter.location` set to the locality id.
2. `place-point`: `filter.location` set to a WKT point taken from a local place. Only when there is no locality.
3. `location-query`: `filter.location.query` set to the city text, with the address check.

A 400 or 404 moves to the next strategy. A 401, 403, 429 or 5xx does not, because retrying would not help. Each run's trace shows which strategy produced the results and the attempts before it.

## Score and evidence policy

- The UI shows only evidence Qloo returned: the insights run and rank (`#k of n`), the signal entity names that were sent, and `popularity`, `affinity` or `rating` when the response contains them.
- `affinity` is read from `query.affinity`, then `affinity`, then `score`. It is shown only when present. Stagehand does not compute affinity.
- Any id the model cites must appear in a tool result from the same run. The submit tools reject ids that were not returned.
- Seed artists are excluded from the shortlist. Stagehand records the Qloo ids that resolve each seed name, and it also matches by normalised name.

## Not used

- **`feature.explainability`:** described in Qloo's insights docs but absent from the per-type parameter list. Not sent.
- **`/v2/tags`:** the path appears in Qloo's guide, but its parameters are not verified. Venue genres go to the model as free text.
- **Audiences (`signal.demographics.audiences`):** not used. The valid URN list has not been found.
- **`compare` analysis endpoint:** not used. `compare_audiences` is computed locally from two insights calls.
- **Heatmap, trends, `bias.*`, `sort_by` on insights, `page`, `offset`:** not used.

## Rate limits, caching and data use

- **Live:** response headers report `x-second-ratelimit-limit: 5` and `x-month-ratelimit-limit: 10000`. More than 100 requests over an hour of testing drew no 429.
- On a 429 or a network failure the client waits about one second and retries once. A second 429 becomes a clear error. Requests time out after 20 seconds. One locality search took 17 seconds during testing.
- Server-side caching is allowed. Stagehand keeps an in-memory cache for 10 minutes, capped at 500 entries. It writes nothing to disk.
- Do not commit Qloo response data to a public repository. `.gitignore` excludes common cache, recorded-response and debug-dump paths (`qloo-responses/`, `recorded/`, `.qloo-cache/`, `*.qloo-cache.json`, `qloo-debug*`, `debug-dumps/`, `*.log`). `DEBUG_QLOO` output goes to the server console only.

## Demo fixtures

`src/lib/demo/fixtures.ts` holds fictional entities with ids prefixed `sample-`. The fixture transport keeps the older documented envelope (`success`, `duration`, a `type` field and a 404 for no results), which the client still accepts. It honours `filter.exclude.entities`, and marks responses with `_sample: true`. The names and numbers are not Qloo output. The fixtures cover every kind Stagehand uses (artist, place, brand, podcast, movie and TV show) and answer any well-formed `/search` or `/v2/insights` call with deterministic sample data, so a real model can be tested against them. They still return 400 for a call with no signal or location, as the real API is documented to. They cannot tell you whether Qloo's real filters work.
