# Headless HeyGen presenter pipeline

Given saved research and a ready visualization report, `POST /api/research/{researchId}/videos` returns HTTP 202 with a persisted job. No browser session or manual HeyGen editor is used. A Node worker generates and validates a structured script, then waits for Confirm or Decline. Confirm binds approval to that exact draft; only then does the worker submit to OpenRouter, poll, download the MP4 with server authorization, and store it locally. The report page includes a button and player below the automation dashboard. Audio is HeyGen TTS from `prompt`, selected with `VIDEO_VOICE_ID`; it is embedded in the returned MP4. No separate audio generation call is required.

## Configure and smoke test first

Copy video settings from `.env.example`. Supply the existing server API key and a HeyGen voice ID. Place the default presenter photo at **`docs/images/presenter.png`**. The folder already exists; this one default is defined in `DEFAULT_PRESENTER_IMAGE_PATH` in `src/lib/video/provider.ts`, shared by the app and smoke test. No image environment setting is needed. Optional `PRESENTER_IMAGE_PATH` (PNG/JPEG/WebP) or public HTTPS `PRESENTER_IMAGE_URL` overrides remain available. A photo is intentionally not bundled. Missing settings or an unreadable photo produce clear errors before a paid request.

**Live API confirmed on 2026-10-25.** Smoke job `gen-vid-1792916112-UeYudNmJ7GSHWNd6bx7y` completed and its MP4 was downloaded to `data/video-smoke/`. Reported `usage.cost`: **$0.3252245**. The working payload uses `input_references`, `prompt` for TTS, and `provider.options.heygen.voice_id` directly (no `parameters` wrapper). `duration` was omitted and accepted. The API rejected `frame_images` for Avatar IV. Voice quality and presenter appearance should still be reviewed by playing the output.

Run `npm run video:smoke`. This makes a real paid request with about eight seconds of speech. It uses the live-confirmed `input_references` mapping by default (an explicit `VIDEO_IMAGE_MAPPING=frame_images` tests that mapping first, falling back only after HTTP 4xx), logs the response including 4xx bodies, polls, and downloads the MP4 to `data/video-smoke`. The exact request JSON is saved there (including image bytes when local; no key). An accepted request is never retried using another mapping. For a timeout/unknown submission outcome, inspect OpenRouter history before trying again. For an accepted job, resume using `VIDEO_SMOKE_JOB_ID=<id> npm run video:smoke`.

After successful output, set `VIDEO_IMAGE_MAPPING` to the printed accepted mapping. Confirm audible speech, chosen voice and presenter appearance by viewing the saved MP4. All provider field mapping lives in `videoRequest` in that file.

Live-confirmed request shape (generic reference documentation: the [OpenRouter video API](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos) and [official provider passthrough guide](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-video/SKILL.md)):

```json
{
  "model": "heygen/avatar-iv",
  "prompt": "Validated spoken text, with numbers spelled out.",
  "resolution": "720p",
  "aspect_ratio": "16:9",
  "generate_audio": true,
  "input_references": [{"type":"image_url","image_url":{"url":"https://your-host/presenter.png"}}],
  "provider": {"options":{"heygen":{"voice_id":"configured-voice","motion_prompt":"Speak calmly, looking directly into the camera, with restrained natural movement."}}}
}
```

`duration` is omitted; Avatar IV is expected to infer speech length. The advisory estimate uses 120 words/minute, multiplied by $0.05/second. `VIDEO_MAX_SECONDS` and `VIDEO_MAX_COST_USD` are advisory targets only: neither blocks Confirm or submission. The user decides on the exact saved draft. Actual speaking speed and billing are controlled upstream. Actual `usage.cost` is stored only if returned, otherwise remains null. Alternative models have no local cost estimate until their pricing is known; confirmed cost is still recorded from provider usage. A 70–85 word script estimates 35–43 seconds (typically around 30 seconds at faster natural speech).

The headless CLI is also available: `npm run video:generate -- <researchId>`. It starts or resumes a job and prints status, script and coverage. It exits when the draft awaits confirmation; use the website Confirm/Decline controls or the decision API. It does not bypass the review step.

## Headless API

```sh
curl -X POST http://localhost:3000/api/research/9/videos
curl http://localhost:3000/api/research/9/videos
curl http://localhost:3000/api/videos/JOB_UUID
# Use the scriptDigest returned by GET to confirm or decline that exact draft:
curl -X POST http://localhost:3000/api/videos/JOB_UUID/decision \
  -H 'Content-Type: application/json' \
  -d '{"decision":"confirm","scriptDigest":"SHA256_FROM_GET"}'
curl http://localhost:3000/api/videos/JOB_UUID/content --output presenter.mp4
```

The status response includes script sentences with their source IDs, source snapshots, validation details, estimated and confirmed costs, provider job ID and a local video URL. MP4 delivery supports byte ranges for seeking. SQLite `video_pitches` and `video_webhook_events` are available to other agents through the existing database. A company's active job is reused. Confirmed drafts wait for render slots; concurrency is reserved transactionally across processes and never rejects a Confirm decision. Terminal jobs permit deliberate generation of a new video.

For callbacks set HTTPS `PUBLIC_BASE_URL` and `OPENROUTER_WEBHOOK_SECRET`. The callback endpoint is `/api/videos/webhook`. It verifies HMAC SHA256 against the raw body, checks timestamp age and future skew within five minutes, and persists idempotency keys. Signed callbacks wake the worker; the worker retrieves authoritative status using its API key before downloading. Polling runs every ten seconds even when callbacks are configured, covering missed callbacks and local development.

Run as a persistent Node server (`npm run start`), with a writable durable database/storage directory. The worker starts through Next instrumentation, survives route completion and resumes stored remote jobs after restart. This interval worker is not a serverless queue; use a durable external worker for serverless hosting. Leases expire after five minutes after crashes. A crash/timeout during submission without a persisted provider job ID is marked failed with an ambiguous-outcome message and is never automatically resubmitted, preventing duplicate charges. Recover the job ID from provider history before a deliberate retry. Known remote jobs keep retrying transient polling/download errors; their latest error is visible.

## Script grounding

One configurable OpenRouter text call returns Zod-validated JSON. At most one regeneration receives validation errors. The 70–85 word target is advisory. Both shorter and longer grounded drafts are reviewable; word count does not trigger regeneration or block confirmation. Drafts are never automatically padded or cut. Source, number, tone, fit and structure checks are advisory notes, not submission blockers once the user confirms. Estimated duration is also advisory. The dollar target is also advisory; a 94-word / 47-second draft costing an estimated $2.35 is accepted with a 45-second target, and higher estimated costs can also be confirmed. Customer-fit and commercial scores no longer block drafting.

The spoken intro is “Hi, I'm from Velho. This is about {company}.” The website still labels the presenter as AI. The script goes straight to named examples and reported outcomes after the intro. Company descriptions and more than two company-name mentions are rejected. Two or three distinct strong findings must support the observations. Combined interpretations use the `inference` kind and explicit uncertainty language. A posting establishes a hiring signal, never proof of inefficiency. The source selector ranks named partner/customer cases and measured outcomes above generic hiring evidence. A successful existing implementation is acknowledged as such; a customer result is not attributed to the company's own operations. The solution is one narrow proposed-action sentence of at most twenty words. The close is a personalized question or next step with its own supporting references. Visualization scenarios are optional and remain conditional when used.

Verified and inferred findings above low confidence enter context; factual sentences can use only verified findings. Deterministic checks enforce references, numeric provenance (including trivial rounding), conditional scenario language, explicit inference framing, company mention limits, banned phrases, clean TTS text and word budget. Deterministic TTS preparation spells ampersands, converts repeated company mentions to direct address, and explicitly labels illustrative outcomes. A lexical overlap heuristic checks that compressed wording retains source content; it does not prove natural-language entailment. The model must still obey the grounding instructions. The exact approved text is checked again before submission; editorial notes do not veto approval.

Citations are built server-side from saved evidence, never invented by the text model. `sentence_citations` stores finding IDs, real external source URLs, titles, reported source dates (null when unknown), Verified/Inferred/Illustrative labels and verification quotes. Visualization numbers cite the saved chart plus its underlying external evidence, clearly distinguishing an internal calculation from external verification. `coverage` stores the used finding count, total saved findings and distinct source categories. The UI shows those records per sentence and the line “Used N of M available findings across K categories”. Spoken text contains no citation markup.

Video jobs transition through queued → awaiting_confirmation → script_ready → submitted → processing → completed, or declined/failed_validation/failed. Approval timestamps and the exact approved script digest are stored in SQLite. A worker restart cannot bypass approval; stale or repeated decisions are rejected. Decline never submits a video. Research and visualization are never rerun by this pipeline. Charts remain in the dashboard and are not composited into the presenter video. Downloaded MP4s remain local; no reliance on provider URL retention. Video is not ZDR eligible.

Run `npm run test:video` for advisory script checks, webhook signature/timestamp checks, advisory cost estimates, credential-safe polling, mocked end-to-end submission/download/cost persistence, concurrency and ambiguous-submission recovery.
