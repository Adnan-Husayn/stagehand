# Qloo API notes for Stagehand

These notes cover the Qloo endpoints Stagehand calls, the parameters it sends, and the response shapes it reads.

Endpoint and parameter facts are confirmed in Qloo's docs unless marked **not yet verified with a live key**, which means implemented but not yet checked against the hackathon API. Items marked **experimental** are called only on an optional path, and the UI labels them. The sections on fallbacks, scores and unused parameters describe Stagehand's own code.

## Base URL and auth

- Base URL: `https://hackathon.api.qloo.com`. Hackathon keys return 401 on `api.qloo.com` and `staging.api.qloo.com`.
- Auth: header `X-Api-Key: <key>`. Not a query parameter or Bearer token.
- Methods: GET only. Parameters go in the query string.
- The key is read on the server only and never logged. `DEBUG_QLOO=1` logs response key names, not values.

## Endpoints Stagehand calls

### `GET /search`: entity lookup (locality, seed artists, local places)

- **Response:** `{ "success": true, "duration": <sec>, "results": [ ... ] }`. `results` is a top-level array, not `results.entities`.
- **Errors:** 404 means no results. 404 and 429 bodies carry `code`, `reason` and `message`. The client treats a 404 whose message says "No results" as an empty list.

| Param | Used as | Notes |
|---|---|---|
| `query` | Name, locality, or place category. Never empty. | |
| `types` | Comma-separated: `urn:entity:artist`, `brand`, `locality`, `movie`, `person`, `place`, `podcast`, `tv_show`. | `locality` is "partially supported". |
| `filter.location` | Locality UUID, `lat,lng`, or `POINT(lng lat)` WKT. | Using the locality UUID is **not yet verified with a live key** on the hackathon host. This is why there is a fallback. |
| `filter.geocode.name`, `.admin1_region`, `.country_code` | City-name geocode filter, used by the fallback chain. | Listed in the docs for place entities. **Not yet verified for `/search`.** Invalid params are ignored, so a result from this path is not guaranteed to be local. The trace shows which strategy produced the places. |
| `filter.radius` | Miles, 0 to 100, default 10. | |
| `take` | Stagehand sends at most 50. | |

Not used: `filter.popularity`, `filter.tags`, `page` and `sort_by`.

Item fields: `entity_id` or `id`, `name`, `type`, `subtype`, and optionally `popularity` or `properties.popularity`. Items without an id or name are dropped.

### `GET /v2/insights`: over-indexing recommendations

- **Response:** `{ "success": true, "results": { "entities": [ ... ], "duration": <sec> } }`.
- **Item shape:** `name`, `entity_id`, `type` (always `"urn:entity"` in the sample), `subtype` (for example `"urn:entity:movie"`), and `properties` (`image.url`, `description`, `akas[]`, `short_descriptions[]`). The sample shows no popularity or affinity, so Stagehand treats both as optional. When `type` is only `urn:entity`, the kind is read from `subtype`.
- **Allowed `filter.type`:** `artist`, `book`, `brand`, `destination`, `movie`, `person`, `place`, `podcast`, `tv_show`, `video_game`. Stagehand uses `artist`, `place`, `brand`, `podcast`, `movie` and `tv_show`.
- **Rules:** a request needs at least one valid signal or filter. Invalid params are ignored silently, so an empty `entities` can mean bad params.

| Param | Used as | Status |
|---|---|---|
| `filter.type` | The entity kind. | Confirmed. |
| `signal.interests.entities` | Comma-separated Qloo ids: seed artists, local places, or the promo artist. | Confirmed. Comma-joining follows Qloo's example. |
| `filter.exclude.entities` | Seed artist ids on artist calls, so Qloo drops the seeds. | Listed for artists in Qloo's entity type guide. **Comma-joined form not yet verified with a live key.** The shortlist validator also rejects seeds. |
| `filter.location` | Locality UUID, for `filter.type=place`. | Confirmed for place. |
| `filter.geocode.name`, `.admin1_region`, `.country_code` | City-name fallback for place calls. | Confirmed for place in the entity type guide. |
| `signal.location.query` | **Experimental.** Natural-language place (the venue city) on artist calls. | Qloo's location-based insights docs show it with a movie example. The entity type guide lists no location param for artists. **Not yet verified for artists.** Used only by `get_location_insights`. Its evidence chip reads "location signal (unconfirmed for artists)", and an artist found only this way is rejected. |
| `take` | 1 to 50, default 20. | Confirmed. |

Entity type parameters (Qloo's entity type guide): artist, brand, podcast, movie and TV show accept `signal.interests.*`, `signal.demographics.*`, `filter.exclude.entities`, `filter.popularity.*`, `filter.tags`, `filter.results.entities`, `bias.trends`, `offset` and `take`. None of them lists a location param. Place adds `filter.location`, `filter.location.radius`, `filter.geocode.*`, `filter.address`, `filter.price_level.*`, `filter.properties.business_rating.*`, `bias.quality` and `sort_by`.

## Local place fallback chain

This is how Stagehand is built. Live behaviour is **not yet verified with a live key**. The locality id may not work in `filter.location`, so local places try these strategies in order and stop at the first non-empty result:

1. `locality-id`: `filter.location` set to the resolved locality id. Only if `resolve_city` succeeded.
2. `geocode-name+region`: city name with the region from the venue text. "Asheville, NC" gives region `NC`. Only when a region is given.
3. `geocode-name`: city name alone.
4. `text-search` (search only): the query plus the city name.

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

- Qloo's docs give no numeric rate limit or monthly quota. The client maps 429 to a clear error.
- Server-side caching is allowed. Stagehand keeps an in-memory cache for 10 minutes, capped at 500 entries. It writes nothing to disk.
- Do not commit Qloo response data to a public repository. `.gitignore` excludes common cache, recorded-response and debug-dump paths (`qloo-responses/`, `recorded/`, `.qloo-cache/`, `*.qloo-cache.json`, `qloo-debug*`, `debug-dumps/`, `*.log`). `DEBUG_QLOO` output goes to the server console only.

## Demo fixtures

`src/lib/demo/fixtures.ts` holds fictional entities with ids prefixed `sample-`. The fixture transport follows the shapes above, honours `filter.exclude.entities`, and marks responses with `_sample: true`. The names and numbers are not Qloo output. The fixtures cover every kind Stagehand uses (artist, place, brand, podcast, movie and TV show) and answer any well-formed `/search` or `/v2/insights` call with deterministic sample data, so a real model can be tested against them. They still return 400 for a call with no signal or location, as the real API is documented to. They cannot tell you whether Qloo's real filters work.
