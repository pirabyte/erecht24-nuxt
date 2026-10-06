# eRecht24 for Nuxt

This is an independent third-party project maintained by Pirabyte. It is not an official eRecht24 product and is not developed, maintained, or endorsed by eRecht24. eRecht24 is a trademark of its respective owner.

Server-side eRecht24 integration for Nuxt 3 and 4. Provides German and English imprint and privacy policy HTML through `/api/legal/imprint` and `/api/legal/privacyPolicy`.

Extracted from the Lornlight website integration. API keys stay on the server. HTML is sanitized before serving and persisted on disk so the last successful document remains available during API failures and across process restarts.

## Installation

The package is not published on npm yet. Install from GitHub:

```sh
npm install github:pirabyte/erecht24-nuxt
```

Requires Node.js 22.18 or newer and a Node server with a writable, persistent cache directory. Static-only hosting and edge runtimes are not supported.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pirabyte/erecht24-nuxt']
})
```

Set the private runtime environment variables:

```dotenv
NUXT_ERECHT24_API_KEY=your-project-api-key
NUXT_ERECHT24_CACHE_DIR=/path/to/persistent/erecht24
```

The plugin key is fixed in the package. Customers only supply their project API key. The official plugin key is pending; the source currently contains the existing eRecht24 demo plugin key. Once issued, the official key will replace it in the repository. Each website needs its own project API key and cache directory. No website credentials are included in this repository.

The local cache defaults to `.data/erecht24`. Production should use a directory outside the deployment folder. A built Nuxt server does not automatically load `.env`; provide the variables through the process environment or Node's `--env-file` option.

## Usage

```vue
<script setup lang="ts">
const { data, error } = await useFetch<{ html: string }>(
  '/api/legal/imprint',
  { query: { lang: 'de' } }
)
</script>

<template>
  <p v-if="error">Legal document unavailable</p>
  <div v-else v-html="data?.html" />
</template>
```

Use `privacyPolicy` for the privacy policy and `lang: 'en'` for English. German is the default. The response is `{ html: string }`. Invalid document names or languages return HTTP 400. If neither the requested API text nor a cached copy is available, the endpoint returns HTTP 503. A missing English text never falls back to German.

The module registers GET `/api/legal/:document`. Remove conflicting website handlers when adopting it. It does not register pages, change their indexing rules, or style the returned markup. The HTML contains the heading supplied by eRecht24.

## Cache and failures

Four JSON files retain the latest sanitized document and fetch timestamp, one per document and language. Texts refresh on the next request after 48 hours, with a five-second API timeout. Failed refreshes keep the previous file and pause retries for five minutes per process. Atomic file replacement and file locks coordinate processes sharing the same directory.

Without an API key, the module only reads existing files. Cache files never expire as a fallback. Delete the dedicated cache directory when retiring the integration or changing the eRecht24 project. Keep it out of Git and public web directories. Use a local filesystem that supports atomic renames and file locks.

Requests to eRecht24 send project and plugin keys, without forwarding visitor headers, cookies, or IP addresses. The endpoint uses `Cache-Control: no-store`; ensure legal pages are not separately prerendered or cached if they must reflect refreshed documents.

## Development

```sh
npm ci
npm test
npm run test:integration
npm pack --dry-run
```

The unit tests cover sanitization, language separation, disk persistence, upstream failures, retry limits, and concurrent processes. The integration test builds a Nuxt fixture and checks API responses and server-rendered legal content. CI runs that fixture on Nuxt 3 and 4. Tests use synthetic documents and do not call the live eRecht24 API.
