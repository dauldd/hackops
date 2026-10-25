# Presenter photo

Place the presenter image in this folder as **`presenter.png`**.

The app and headless smoke test both use `docs/images/presenter.png` by default. The single default path is defined as `DEFAULT_PRESENTER_IMAGE_PATH` in `src/lib/video/provider.ts`.

Use a clear, front-facing photo suitable for the AI presenter. Keep the original PNG format. If your image is JPEG or WebP, use `PRESENTER_IMAGE_PATH` to point to that file instead of changing its extension.

Once the photo and `VIDEO_VOICE_ID` are configured, run `npm run video:smoke` from the project root to verify HeyGen's live image and voice integration.
