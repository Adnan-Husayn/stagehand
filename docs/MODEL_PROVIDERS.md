# Free model providers for Stagehand

Notes from 2026-10-11 on which hosted model APIs I can run Stagehand's agent on without paying. The agent needs the OpenAI-style Chat Completions API with function calling and multi-turn tool loops. A session is roughly 8 to 14 model requests, each carrying about 8,000 characters of fixed prompt and tool definitions plus the growing history.

I read each provider's own documentation where I could. A row marked "unconfirmed" means I did not find the fact on an official page. Provider limits change often, so check your own account's limits page before a demo.

## Comparison

| Provider | Free limits | Best free tool-calling model today | Card needed | Base URL | Source |
|---|---|---|---|---|---|
| Google Gemini API (AI Studio) | Google no longer publishes a per-model table. Limits are per project and shown in AI Studio. Unofficial reports: 3.8 Flash 20 requests/day, Flash-Lite 500 requests/day (unconfirmed) | `gemini-3.5-flash-lite` (free, listed for "high-volume agentic work"). `gemini-3.8-flash` is stronger but its reported daily cap is low | No. The free tier needs only an active project | `https://generativelanguage.googleapis.com/v1beta/openai/` | Pricing: https://ai.google.dev/gemini-api/docs/pricing. OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai. Billing: https://ai.google.dev/gemini-api/docs/billing. Regions: https://ai.google.dev/gemini-api/docs/available-regions |
| Groq | Unconfirmed for the free plan. The official page I read showed these base limits for `openai/gpt-oss-120b`: 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day | `openai/gpt-oss-120b` (production model). `llama-3.3-70b-versatile` also supports parallel tool calls | Unconfirmed on an official page. A community post says no card | `https://api.groq.com/openai/v1` | Limits: https://console.groq.com/docs/rate-limits. Tool use: https://console.groq.com/docs/tool-use. Models: https://console.groq.com/docs/models. OpenAI compatibility: https://console.groq.com/docs/openai |
| Cerebras | Free Trial: 5 requests/min, 30,000 uncached tokens/min, 1,000,000 tokens/day, 64,000 to 65,000 token context | `gpt-oss-120b` | Yes. Its rate-limit FAQ says API access stays inactive until a verified payment method is added, and there is no permanently free tier | `https://api.cerebras.ai/v1` (unconfirmed) | https://inference-docs.cerebras.ai/support/rate-limits and https://inference-docs.cerebras.ai/models/overview |
| OpenRouter free models | 20 requests/min. 50 requests/day with under 10 credits purchased, 1,000/day with 10 or more | Models change often. Tool-capable `:free` ids in the public catalog today include `nvidia/nemotron-3-ultra-550b-a55b:free`, `google/gemma-4-31b-it:free` and `poolside/laguna-s-2.1:free`. I have not tested any | Not stated on the limits page | `https://openrouter.ai/api/v1` | Limits: https://openrouter.ai/docs/api-reference/limits. Tool calling: https://openrouter.ai/docs/guides/features/tool-calling. Catalog: https://openrouter.ai/api/v1/models |
| Mistral | Unconfirmed. I could not find the free API tier on mistral.ai or docs.mistral.ai pages I could load. Third-party sites describe an "Experiment" plan with phone verification, about 500,000 tokens/min, 1 billion tokens/month and roughly 1 to 2 requests/min | Unconfirmed. The docs list Mistral Small 4 and Mistral Medium 3.5 but not their API ids | Unconfirmed. Third-party sites say no card | `https://api.mistral.ai/v1` (unconfirmed) | https://docs.mistral.ai/getting-started/models/models_overview/ and https://mistral.ai/pricing |
| GitHub Models | None. The service was retired on 2026-07-30 | None | Not applicable | Not applicable | https://docs.github.com/en/github-models/prototyping-with-ai-models |

## Region

Gemini: the available-regions page lists both India and the United States, so a key made in India works from Vercel's US regions. I did not check regional availability for Groq, OpenRouter or Mistral.

## What I could not confirm

- Gemini's current free limits per model. The two numbers above come from a user post on https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609 and have no reply from Google. Open https://aistudio.google.com/rate-limit with your key's project to see the real figures.
- Gemini's exact thought-signature format on the OpenAI-compatible endpoint. The compatibility page says Gemini 3 supports it in chat completions but shows no JSON. Stagehand sends each tool call back to the provider exactly as it received it, which keeps any such field.
- Whether Groq's free plan matches the table I read, and whether a card is needed there.
- The Cerebras and Mistral base URLs, and everything about Mistral's free tier.
- Tool-calling quality of every model above. I made no model requests while writing this.

## Data use

On Gemini's free tier, Google's pricing page lists inputs and outputs as used to improve its products. Venue details and Qloo results from a run go to the model provider. Do not put private information in the venue form on the free tier.

## Recommendation

Default: Gemini API with `gemini-3.5-flash-lite`. It needs no card, it is the only card-free option here whose reported daily requests and tokens per minute both fit an agent loop, and the OpenAI-compatible endpoint documents function calling with `tool_choice` set to `auto`. Groq's reported 8,000 tokens per minute is smaller than what a few turns of this agent send. By my estimate a run would hit that limit around the third or fourth request, and the 20 second retry window would not clear it. If you get a larger Gemini quota in AI Studio, set `LLM_MODEL=gemini-3.8-flash` for better tool calling.

Fallback: Groq with `openai/gpt-oss-120b`. Set `LLM_BASE_URL=https://api.groq.com/openai/v1` and `LLM_MODEL=openai/gpt-oss-120b`. Expect rate-limit errors on longer runs unless the free plan allows more tokens per minute than the table I read.
