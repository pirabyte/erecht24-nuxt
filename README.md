# eRecht24 for Nuxt

This is an independent third-party project maintained by Pirabyte. It is not an official eRecht24 product and is not developed, maintained, or endorsed by eRecht24. eRecht24 is a trademark of its respective owner.

Server-side eRecht24 integration for Nuxt 3 and 4. Provides German and English imprint and privacy policy HTML through `/api/legal/imprint` and `/api/legal/privacyPolicy`.

Extracted from the Lornlight website integration. API keys stay on the server. HTML is sanitized before serving and persisted on disk so the last successful document remains available during API failures and across process restarts.

## Installation

```sh
npm install @pirabyte/erecht24-nuxt
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

The verified developer key issued by eRecht24 is included in the package as its public plugin identifier. Customers only supply their private project API key. Each website needs its own project API key and cache directory. No website credentials are included in this repository.

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

## Other Node frameworks

The server entrypoint provides the same sanitization and persistent cache to frameworks such as Next.js, without installing Nuxt. Import it only in server code running on Node.js:

```ts
import { getERecht24Document } from '@pirabyte/erecht24-nuxt/server'

const html = await getERecht24Document(
  { apiKey: process.env.ERECHT24_API_KEY ?? '', cacheDir: '.data/erecht24' },
  'imprint',
  'de'
)
```

It returns sanitized HTML or `null` when neither upstream nor cache provides a usable document. Invalid document names or languages throw a `TypeError` before accessing storage or the API. `Config`, `DocumentType`, and `Language` are exported types. Use a persistent cache directory and handle `null` as an unavailable document in your framework.

Only `sanitize-html` and `proper-lockfile` are runtime dependencies. Nuxt, Nitro, `@nuxt/kit`, and `h3` are optional peers supplied by a Nuxt application's existing framework installation. The package does not register push callbacks.

## Development

```sh
npm ci
npm test
npm run test:integration
npm run test:package
npm pack --dry-run
```

The unit tests cover sanitization, language separation, disk persistence, upstream failures, retry limits, and concurrent processes. The integration test builds a Nuxt fixture and checks API responses and server-rendered legal content. CI runs that fixture on Nuxt 3 and 4. The package test installs the actual tarball in an isolated Node project and checks the server entrypoint without Nuxt or install scripts. Tests use synthetic documents and do not call the live eRecht24 API.
