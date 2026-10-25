# Headless HeyGen presenter pipeline

Given saved research and a ready visualization report, `POST /api/research/{researchId}/videos` returns HTTP 202 with a persisted job. No browser session or manual HeyGen editor is used. A Node worker generates a structured script, validates it, submits to OpenRouter, polls, downloads the MP4 with server authorization, and stores the result locally. The report page includes a button and player below the automation dashboard. Audio is HeyGen TTS from `prompt`, selected with `VIDEO_VOICE_ID`; it is embedded in the returned MP4. No separate audio generation call is required.

## Configure and smoke test first

Copy video settings from `.env.example`. Supply the existing server API key and a HeyGen voice ID. Place the default presenter photo at **`docs/images/presenter.png`**. The folder already exists; this one default is defined in `DEFAULT_PRESENTER_IMAGE_PATH` in `src/lib/video/provider.ts`, shared by the app and smoke test. No image environment setting is needed. Optional `PRESENTER_IMAGE_PATH` (PNG/JPEG/WebP) or public HTTPS `PRESENTER_IMAGE_URL` overrides remain available. A photo is intentionally not bundled. Missing settings or an unreadable photo produce clear errors before a paid request.

**HeyGen image mapping, provider passthrough slug, TTS behavior, and inferred duration remain UNVERIFIED against the live API.** The initial test could not run because no voice or presenter image was configured. Do not interpret mocked integration tests as a provider confirmation.

Run `npm run video:smoke`. This makes a real paid request with about eight seconds of speech. It tries `frame_images` first and `input_references` only after an explicit HTTP 4xx rejection, logs the response including 4xx bodies, polls, and downloads the MP4 to `data/video-smoke`. The exact request JSON is saved there (including image bytes when local; no key). An accepted request is never retried using another mapping. For a timeout/unknown submission outcome, inspect OpenRouter history before trying again. For an accepted job, resume using `VIDEO_SMOKE_JOB_ID=<id> npm run video:smoke`.

After successful output, set `VIDEO_IMAGE_MAPPING` to the printed accepted mapping. Confirm audible speech, chosen voice and presenter appearance by viewing the saved MP4. Update the UNVERIFIED comment in `src/lib/video/provider.ts` with the successful response/mapping. All provider field mapping lives in `videoRequest` in that file.

Best-guess payload based on the [OpenRouter video API](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos) and [official provider passthrough guide](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-video/SKILL.md):

```json
{
  "model": "heygen/avatar-iv",
  "prompt": "Validated spoken text, with numbers spelled out.",
  "resolution": "720p",
  "aspect_ratio": "16:9",
  "generate_audio": true,
  "frame_images": [{"type":"image_url","image_url":{"url":"https://your-host/presenter.png"},"frame_type":"first_frame"}],
  "provider": {"options":{"heygen":{"parameters":{"voice_id":"configured-voice","motion_prompt":"Speak calmly, looking directly into the camera, with restrained natural movement."}}}}
}
```

`duration` is omitted; Avatar IV is expected to infer speech length. The preflight guard estimates conservatively at 120 words/minute, multiplied by $0.05/second, and refuses above either configured cap. This is an estimated spend guard, not a provider-enforced billing limit: actual speaking speed is controlled upstream. Actual `usage.cost` is stored only if returned, otherwise remains null. Alternative video models are refused until their pricing is implemented. A 70–85 word script estimates 35–43 seconds (typically around 30 seconds at faster natural speech).

## Headless API

```sh
curl -X POST http://localhost:3000/api/research/9/videos
curl http://localhost:3000/api/research/9/videos
curl http://localhost:3000/api/videos/JOB_UUID
curl http://localhost:3000/api/videos/JOB_UUID/content --output presenter.mp4
```

The status response includes script sentences with their source IDs, source snapshots, validation details, estimated and confirmed costs, provider job ID and a local video URL. MP4 delivery supports byte ranges for seeking. SQLite `video_pitches` and `video_webhook_events` are available to other agents through the existing database. A company's active job is reused; concurrency is guarded transactionally across processes. Terminal jobs permit deliberate generation of a new video.

For callbacks set HTTPS `PUBLIC_BASE_URL` and `OPENROUTER_WEBHOOK_SECRET`. The callback endpoint is `/api/videos/webhook`. It verifies HMAC SHA256 against the raw body, checks timestamp age and future skew within five minutes, and persists idempotency keys. Signed callbacks wake the worker; the worker retrieves authoritative status using its API key before downloading. Polling runs every ten seconds even when callbacks are configured, covering missed callbacks and local development.

Run as a persistent Node server (`npm run start`), with a writable durable database/storage directory. The worker starts through Next instrumentation, survives route completion and resumes stored remote jobs after restart. This interval worker is not a serverless queue; use a durable external worker for serverless hosting. Leases expire after five minutes after crashes. A crash/timeout during submission without a persisted provider job ID is marked failed with an ambiguous-outcome message and is never automatically resubmitted, preventing duplicate charges. Recover the job ID from provider history before a deliberate retry. Known remote jobs keep retrying transient polling/download errors; their latest error is visible.

## Script grounding

One configurable OpenRouter text call returns Zod-validated JSON. At most one regeneration receives validation errors. Word count must be 70–85 for video submission; short, honest thin-evidence drafts are retained as `failed_validation`, never padded or rendered. Scores below 40 for either customer fit/commercial attractiveness, unsuitable delivery, deprioritize or insufficient-evidence recommendations block generation.

Only verified findings above low confidence enter script context. Sources are snapshotted with stable prefixed IDs for findings, proposals and charts. Deterministic validation is deliberately conservative: factual wording must be an extractive source span, with natural number spelling allowed. Proposed work uses a saved proposal span, and chart benefits use a fixed conditional scenario frame. This sacrifices paraphrase flexibility to avoid treating an LLM's self-declared citation as proof. Hiring statements require explicit hiring wording. Arbitrary factual prose cannot be hidden in intro/close fields; those have exact templates. Unsupported numeric phrases, missing references, missing disclosure, hype, emojis and symbols fail validation. The script is checked again immediately before the paid submission.

Video jobs transition through queued → script_ready → submitted → processing → completed, or failed_validation/failed. Research and visualization are never rerun by this pipeline. Charts remain in the dashboard and are not composited into the presenter video. Downloaded MP4s remain local; no reliance on provider URL retention. Video is not ZDR eligible.

Run `npm run test:video` for grounded script rejection, webhook signature/timestamp checks, cost guards, credential-safe polling, mocked end-to-end submission/download/cost persistence, concurrency and ambiguous-submission recovery.
