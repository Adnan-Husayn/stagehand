# Devpost text for Stagehand

Project name: Stagehand

Tagline (200 characters max): A booking and promotion agent for small music venues. It reads Qloo taste data to shortlist touring artists for your city, then builds a promo plan for the one you pick.

Try it out links:
- https://stagehand-venues.vercel.app
- https://github.com/Adnan-Husayn/stagehand

Built with: nextjs, typescript, react, tailwindcss, vercel, qloo, deepseek, vitest

## Inspiration

I am a final-year B.Tech CSE student at Integral University in Lucknow. Small venues face the same question for every slot: which act will sell in this room, on this night? A booker at a 300-capacity venue usually answers it from instinct and from what sold last time. Then the same person has to find partners and write the promo emails for the show. I wanted to see whether Qloo's taste data could give a booker something better than a guess for both jobs.

## What it does

You enter a venue: its city, its capacity, its genres, and up to five artists that sold well for you. Stagehand's agent resolves the city as a Qloo locality, finds local live-music places, and asks Qloo insights which artists those audiences over-index on. It runs a second insights call from your seed artists and compares the two audiences. It returns about eight artists, and each one comes with its evidence: its rank in the Qloo results, its affinity and its popularity. Your seed artists are never recommended back.

Then you pick one artist. The agent builds a promo plan for that show: local partners such as record shops and bars, suggested ad audiences, and two draft emails. The partner candidates come from Qloo insights on that artist, including places filtered to your city.

Every Qloo call shows up live in an activity panel while the agent works. The background is a drawn stage whose lamps light one per finished agent step, so you can see how far along it is.

Without Qloo the shortlist would be names a language model finds plausible. Here the names come from measured overlap in Qloo's taste graph, and the app rejects any artist or partner id that did not come back from a Qloo call in the same run.

## How I built it

Stagehand is a Next.js 15 and TypeScript app on Vercel. The browser posts to one API route and gets trace events and the result back as server-sent events. The agent loop runs on an OpenAI-compatible chat model with tool calling, with DeepSeek in production. I wrote a small typed client for the Qloo API, and the model has tools for city resolution, place search, artist search, insights, and an audience comparison. Two submit tools end a run, one for the shortlist and one for the promo plan. Each submit checks its input against that run's results before the UI shows it.

The Qloo endpoints are /search for localities, places and artists, and /v2/insights for artists, places, brands, podcasts, movies and TV shows. The evidence chips on the page are built from the Qloo responses themselves. There are 175 Vitest tests that run offline, including an end-to-end run with a scripted fake model.

## Challenges I ran into

The first live run showed that the real Qloo API differs from its documentation in several places. Search returns a types array instead of a single type. The city geocode filters had no effect on search, so I filter places by the locality's coordinates. Locality search is fuzzy: searching "Portland, ME" put Portland, Oregon near the top, so a matcher in code picks the right same-named city using the state or country. Some towns, like Hebden Bridge, have no Qloo locality at all, so the agent falls back to places whose address names the town. I kept notes on each difference in docs/QLOO_NOTES.md.

The hackathon key allows 5 requests per second and 10,000 per month, so the client retries once on a 429 and caches repeated calls for ten minutes.

## Accomplishments that I'm proud of

The live site runs on live Qloo data. Shortlist and promo runs finished for Asheville, Marfa, Portland (Maine) and Hebden Bridge, each in 15 to 35 seconds. That is a handful of runs, and I say so in the README. I am also glad that every name on screen can be traced to a Qloo response, and that the activity panel lets a booker watch that happen.

## What I learned

Real API behaviour beats the docs, so test early with a real key. A language model is good at choosing which call to make next and bad at remembering which ids it was given, so the code has to check its output. I also learned how much the progress display matters for an agent that takes half a minute: the stage lamps made the wait easier to sit through.

## Limits

Audience overlap often comes back empty. In my test runs the local and seed audiences usually shared no artists, so most shortlists leaned on the seed run. Small cities may have no Qloo locality. Qloo's artist location signal is experimental and labelled that way in the app. Drafted emails keep [placeholders] for facts the app does not know, and nothing is sent automatically. Only DeepSeek has been tested as the model.

## What's next

Use Qloo's audience data when I can find the valid audience list. Let a booker save a shortlist between visits, since results now exist only in the open tab. Show it to working bookers and fix what they find.
