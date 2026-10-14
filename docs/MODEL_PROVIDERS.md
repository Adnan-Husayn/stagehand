# Model providers for Stagehand

Notes from 2026-10-11 on which hosted model APIs I can run Stagehand's agent on, free ones first and DeepSeek as the paid option. The agent needs the OpenAI-style Chat Completions API with function calling and multi-turn tool loops. A shortlist run or a promo run is roughly 8 to 14 model requests, so a full session (a shortlist plus one promo plan) is about 16 to 28. Each request carries about 8,000 characters of fixed prompt and tool definitions plus the growing history.

I read each provider's own documentation where I could. A row marked "unconfirmed" means I did not find the fact on an official page. Provider limits change often, so check your own account's limits page before a demo.

## Comparison

| Provider | Free limits | Best free tool-calling model today | Card needed | Base URL | Source |
|---|---|---|---|---|---|
| Google Gemini API (AI Studio) | Google no longer publishes a per-model table. Limits are per project and shown in AI Studio. Unofficial reports: 3.8 Flash 20 requests/day, Flash-Lite 500 requests/day (unconfirmed) | `gemini-3.5-flash-lite` (free, listed for "high-volume agentic work"). `gemini-3.8-flash` is stronger but its reported daily cap is low | No. The free tier needs only an active project | `https://generativelanguage.googleapis.com/v1beta/openai/` | Pricing: https://ai.google.dev/gemini-api/docs/pricing. OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai. Billing: https://ai.google.dev/gemini-api/docs/billing. Regions: https://ai.google.dev/gemini-api/docs/available-regions |
| Groq | Unconfirmed for the free plan. The official page I read showed these base limits for `openai/gpt-oss-120b`: 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day | `openai/gpt-oss-120b` (production model). `llama-3.3-70b-versatile` also supports parallel tool calls | Unconfirmed on an official page. A community post says no card | `https://api.groq.com/openai/v1` | Limits: https://console.groq.com/docs/rate-limits. Tool use: https://console.groq.com/docs/tool-use. Models: https://console.groq.com/docs/models. OpenAI compatibility: https://console.groq.com/docs/openai |
| Cerebras | Free Trial: 5 requests/min, 30,000 uncached tokens/min, 1,000,000 tokens/day, 64,000 to 65,000 token context | `gpt-oss-120b` | Yes. Its rate-limit FAQ says API access stays inactive until a verified payment method is added, and there is no permanently free tier | `https://api.cerebras.ai/v1` (unconfirmed) | https://inference-docs.cerebras.ai/support/rate-limits and https://inference-docs.cerebras.ai/models/overview |
| OpenRouter free models | 20 requests/min. 50 requests/day with under 10 credits purchased, 1,000/day with 10 or more | Models change often. Tool-capable `:free` ids in the public catalog today include `nvidia/nemotron-3-ultra-550b-a55b:free`, `google/gemma-4-31b-it:free` and `poolside/laguna-s-2.1:free`. I have not tested any | Not stated on the limits page | `https://openrouter.ai/api/v1` | Limits: https://openrouter.ai/docs/api-reference/limits. Tool calling: https://openrouter.ai/docs/guides/features/tool-calling. Catalog: https://openrouter.ai/api/v1/models |
| Mistral | Unconfirmed. I could not find the free API tier on mistral.ai or docs.mistral.ai pages I could load. Third-party sites describe an "Experiment" plan with phone verification, about 500,000 tokens/min, 1 billion tokens/month and roughly 1 to 2 requests/min | Unconfirmed. The docs list Mistral Small 4 and Mistral Medium 3.5 but not their API ids | Unconfirmed. Third-party sites say no card | `https://api.mistral.ai/v1` (unconfirmed) | https://docs.mistral.ai/getting-started/models/models_overview/ and https://mistral.ai/pricing |
| DeepSeek (paid) | No free tier. Prepaid balance. Limit is concurrency per account: 2,500 requests for `deepseek-flash`, 500 for `deepseek-v4-pro`. The page states no requests-per-minute or daily cap | `deepseek-flash` (tool calls: yes). `deepseek-v4-pro` is the larger option | Not stated. Billing draws on a topped-up balance | `https://api.deepseek.com` | Models and pricing: https://api-docs.deepseek.com/quick_start/pricing. Rate limits: https://api-docs.deepseek.com/quick_start/rate_limit. Tool calls: https://api-docs.deepseek.com/guides/tool_calls. Thinking mode: https://api-docs.deepseek.com/guides/thinking_mode |
| GitHub Models | None. The service was retired on 2026-07-30 | None | Not applicable | Not applicable | https://docs.github.com/en/github-models/prototyping-with-ai-models |

## DeepSeek

Read from DeepSeek's own documentation on 2026-10-11. Since 14 October 2026 the live site runs on `deepseek-flash`, and shortlist and promo runs have finished against the real Qloo API. The price figures below are still estimates.

**Setup.** Three values:

```
LLM_API_KEY=<your DeepSeek key>
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
```

I also suggest `LLM_THINKING=disabled` (see below). Stagehand posts to `https://api.deepseek.com/chat/completions`.

**Models.** The docs list `deepseek-flash` (DeepSeek-V4.1-Flash) and `deepseek-v4-pro` (DeepSeek-V4-Pro-0813). Both list Tool Calls and JSON Output as supported, with a 1M token context and 384K maximum output. The older ids `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` still work but now route to the Flash model at the Flash price. Source: https://api-docs.deepseek.com/quick_start/pricing and https://api-docs.deepseek.com/.

**Price per 1M tokens (USD).** Peak hours are 01:00 to 04:00 and 06:00 to 10:00 UTC, Monday to Friday, except Chinese public holidays. Everything else is off-peak, at half the peak price.

| | Input, cache hit | Input, cache miss | Output |
|---|---|---|---|
| `deepseek-flash`, peak | 0.006 | 0.30 | 1.20 |
| `deepseek-flash`, off-peak | 0.003 | 0.15 | 0.60 |
| `deepseek-v4-pro`, peak | 0.044 | 1.32 | 3.96 |
| `deepseek-v4-pro`, off-peak | 0.022 | 0.66 | 1.98 |

DeepSeek may change these, so check https://api-docs.deepseek.com/quick_start/pricing before relying on them.

**Cost of one Stagehand session.** I have no measured token counts yet, so this is an estimate. Assumptions: a session is a shortlist run plus one promo run, about 18 model requests. Each request carries about 2,500 tokens of fixed prompt and tool definitions plus the growing history, averaging about 4,500 input tokens, so about 80,000 input tokens per session. Output is about 5,000 tokens, mostly the two submit calls and the email drafts.

| Case | `deepseek-flash` | `deepseek-v4-pro` |
|---|---|---|
| No cache hits, peak price | $0.030 | $0.125 |
| 70% of input cached, peak | $0.014 | $0.054 |
| 70% of input cached, off-peak | $0.007 | $0.027 |
| Thinking on (adds about 12,000 output tokens), 70% cached, peak | $0.028 | $0.10 |

So a session on `deepseek-flash` should cost between 1 and 3 US cents. The cache-hit share is a guess. Each request repeats the same system prompt and tool list, which should cache, but I have not seen DeepSeek's usage numbers. `npm run live:check` prints real token counts, and I will replace this table with them.

**Rate limits.** The only limit on the docs page is concurrency per account: 2,500 for Flash, 500 for Pro. Past it the API returns HTTP 429. A Stagehand run sends one request at a time, so it should never get near that. The page says a request that has not started inference after 10 minutes is closed by the server, and that while a request waits, non-streaming responses carry empty lines. `JSON.parse` ignores leading blank lines, so the client reads these bodies without a change. Source: https://api-docs.deepseek.com/quick_start/rate_limit.

**Tool-calling notes.**

- Thinking mode is on by default for both models. With tools in the request, the docs say `reasoning_content` from each reply "must be fully passed back" on every later request, and a request without it returns a 400. Stagehand now keeps `reasoning_content` and sends it back, so the default works. Source: https://api-docs.deepseek.com/guides/thinking_mode.
- Thinking adds latency and output tokens. `LLM_THINKING=disabled` sends `"thinking": {"type": "disabled"}`, which the docs give as the way to turn it off. I expect it to be faster and cheaper for a loop of short tool calls, but I have not measured either mode.
- Thinking mode ignores `temperature`. Source: the thinking mode page above.
- Strict mode is a beta. It needs the base URL `https://api.deepseek.com/beta`, `"strict": true` on every function, every object property listed as required, and no `minItems`, `maxItems`, `minLength` or `maxLength`. Stagehand's schemas use `minItems` and `maxItems` and have optional properties, so strict mode would reject them. Stagehand does not use it. Source: https://api-docs.deepseek.com/guides/tool_calls.
- The Chat Completions API does not support inserting tool calls mid-conversation. Stagehand does not do that.
- JSON mode (`response_format` of `{"type": "json_object"}`) exists. Stagehand does not use it, because it takes its structured output from the submit tools. Source: https://api-docs.deepseek.com/guides/json_mode.
- The docs do not mention parallel tool calls or a limit on the number of tools. Stagehand handles several calls in one reply either way.
- DeepSeek accepts Stagehand's tool schemas as they are. Live runs on the deployed site confirm it.

## Temperature

Stagehand now leaves `temperature` out of the request unless `LLM_TEMPERATURE` is set. It used to send 0.2.

- Gemini 3: Google "strongly recommend[s] keeping the temperature parameter at its default value of 1.0" and warns that lower values can cause looping or worse results. Source: https://ai.google.dev/gemini-api/docs/gemini-3. The OpenAI compatibility page says nothing about temperature.
- DeepSeek: the default is 1.0. Its parameter page lists 0.0 for coding and math and 1.0 for data analysis, and gives no value for tool use. Thinking mode ignores the field. Source: https://api-docs.deepseek.com/quick_start/parameter_settings.

Both presets in the live check therefore send no temperature. If DeepSeek with thinking off turns out to make sloppy tool arguments, try `LLM_TEMPERATURE=0` and compare. `LLM_TEMPERATURE` takes a number from 0 to 2. Anything else is ignored.

## Region

Gemini: the available-regions page lists both India and the United States, so a key made in India works from Vercel's US regions. I did not check regional availability for Groq, OpenRouter or Mistral.

## What I could not confirm

- Gemini's current free limits per model. The two numbers above come from a user post on https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609 and have no reply from Google. Open https://aistudio.google.com/rate-limit with your key's project to see the real figures.
- Gemini's exact thought-signature format on the OpenAI-compatible endpoint. The compatibility page says Gemini 3 supports it in chat completions but shows no JSON. Stagehand sends each tool call back to the provider exactly as it received it, which keeps any such field.
- Whether Groq's free plan matches the table I read, and whether a card is needed there.
- The Cerebras and Mistral base URLs, and everything about Mistral's free tier.
- Tool-calling quality of every model above except `deepseek-flash`, which runs the live site.
- The exact field that carries Gemini's thought signature on the OpenAI-compatible endpoint. Google's thinking guide says signatures must be sent back unchanged in stateless use, but its chat completions section shows no JSON. Stagehand keeps every field of each tool call it receives, which should cover it.

## Data use

On Gemini's free tier, Google's pricing page lists inputs and outputs as used to improve its products. Venue details and Qloo results from a run go to the model provider. Do not put private information in the venue form on the free tier.

## Recommendation

Default in code: Gemini API with `gemini-3.5-flash-lite`. It needs no card, it is the only card-free option here whose reported daily requests and tokens per minute both fit an agent loop, and the OpenAI-compatible endpoint documents function calling with `tool_choice` set to `auto`. Groq's reported 8,000 tokens per minute is smaller than what a few turns of this agent send. By my estimate a run would hit that limit around the third or fourth request, and the 20 second retry window would not clear it. If you get a larger Gemini quota in AI Studio, set `LLM_MODEL=gemini-3.8-flash` for better tool calling.

Fallback: Groq with `openai/gpt-oss-120b`. Set `LLM_BASE_URL=https://api.groq.com/openai/v1` and `LLM_MODEL=openai/gpt-oss-120b`. Expect rate-limit errors on longer runs unless the free plan allows more tokens per minute than the table I read.

Paid option, used on the live site: DeepSeek with `deepseek-flash`, at roughly 1 to 3 US cents a session by my estimate (see the DeepSeek section).
