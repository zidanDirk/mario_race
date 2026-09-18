# Google OAuth relay

This Cloudflare Pages Function runs on the Workers runtime and is a narrow server-to-server relay for deployments whose backend cannot reach Google's token and UserInfo endpoints. It accepts only `POST /google/exchange`, authenticates the backend with `RELAY_SECRET`, requires the exact production callback URI, and returns only the stable Google subject, display name, and avatar.

Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RELAY_SECRET`, and `GOOGLE_REDIRECT_URI` as Cloudflare Pages production secrets. Never commit `.dev.vars`, `.env`, OAuth codes, access tokens, or secret values. The Alibaba backend uses the same `RELAY_SECRET` through `GOOGLE_RELAY_SECRET` and sets `GOOGLE_RELAY_URL` to `https://mario-google-oauth-relay-pages.pages.dev/google/exchange`.

The Function does not store account or race data. Google authorization codes are single-use, and access tokens exist only for the duration of one request. The `pages/_worker.js` entry point reuses the reviewed implementation in `src/index.mjs`.
