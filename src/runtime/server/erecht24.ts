import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import lockfile from 'proper-lockfile'
import sanitizeHtml from 'sanitize-html'

export type DocumentType = 'imprint' | 'privacyPolicy'
export type Language = 'de' | 'en'

export type Config = {
  apiKey: string
  cacheDir: string
}

type CachedDocument = {
  html: string
  fetchedAt: number
}

const CACHE_TTL = 48 * 60 * 60 * 1000
const RETRY_DELAY = 5 * 60 * 1000
// Public plugin identifier issued by eRecht24; project API keys remain private.
const ERECHT24_PLUGIN_KEY = 'vRuG4GQHxYb9MkxU3HURJTyDUHyDyE3scTV4vzzR8VPHbwyT3krWzM6vS4vmeqfm'
const retryAfter = new Map<string, number>()

function cleanHtml(html: string): string {
  const cleaned = sanitizeHtml(html, {
    allowedTags: ['a', 'br', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'strong', 'ul'],
    allowedAttributes: { a: ['href', 'name', 'rel', 'target', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'svg', 'math', 'iframe', 'object', 'embed'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
    }
  }).trim()
  const text = sanitizeHtml(cleaned, { allowedTags: [], allowedAttributes: {} })
  return text.replaceAll('&nbsp;', ' ').trim() ? cleaned : ''
}

async function readDocument(file: string): Promise<CachedDocument | null> {
  try {
    const data: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!data || typeof data !== 'object' || !('html' in data) || !('fetchedAt' in data)
      || typeof data.html !== 'string' || typeof data.fetchedAt !== 'number'
      || !Number.isFinite(data.fetchedAt) || data.fetchedAt <= 0 || data.fetchedAt > Date.now()) {
      return null
    }

    const html = cleanHtml(data.html)
    return html ? { html, fetchedAt: data.fetchedAt } : null
  } catch {
    return null
  }
}

function isFresh(document: CachedDocument | null): boolean {
  if (!document) return false
  const age = Date.now() - document.fetchedAt
  return age >= 0 && age < CACHE_TTL
}

// Keep the previous file intact until the complete replacement is ready.
async function writeDocument(file: string, document: CachedDocument): Promise<void> {
  const temporaryFile = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryFile, JSON.stringify(document), { mode: 0o600, flag: 'wx' })
    await rename(temporaryFile, file)
  } finally {
    await unlink(temporaryFile).catch(() => {})
  }
}

// Refresh on demand, retaining the last usable document across failures and restarts.
export async function getERecht24Document(
  config: Config,
  type: DocumentType,
  language: Language
): Promise<string | null> {
  if ((type !== 'imprint' && type !== 'privacyPolicy')
    || (language !== 'de' && language !== 'en')) {
    throw new TypeError('Invalid legal document or language')
  }

  const directory = resolve(config.cacheDir)
  const file = join(directory, `${type}-${language}.json`)
  let cached = await readDocument(file)

  if (isFresh(cached) || !config.apiKey
    || Date.now() < (retryAfter.get(file) ?? 0)) {
    return cached?.html ?? null
  }

  let release: (() => Promise<void>) | undefined
  let compromised = false

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    release = await lockfile.lock(file, {
      realpath: false,
      stale: 60_000,
      update: 10_000,
      retries: { retries: 24, minTimeout: 100, maxTimeout: 250 },
      onCompromised: () => { compromised = true }
    })

    // Another PM2 process may have refreshed the document while we waited.
    cached = await readDocument(file)
    if (isFresh(cached) || Date.now() < (retryAfter.get(file) ?? 0)) {
      return cached?.html ?? null
    }

    const response = await fetch(`https://api.e-recht24.de/v2/${type}`, {
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
      headers: {
        'eRecht24-api-key': config.apiKey,
        'eRecht24-plugin-key': ERECHT24_PLUGIN_KEY
      }
    })
    if (!response.ok) throw new Error('API request failed')

    const data: unknown = await response.json()
    const field = language === 'de' ? 'html_de' : 'html_en'
    const rawHtml = data && typeof data === 'object' && field in data
      ? (data as Record<string, unknown>)[field]
      : undefined
    const html = typeof rawHtml === 'string' ? cleanHtml(rawHtml) : ''
    if (!html || compromised) throw new Error('No usable document or lock lost')

    await writeDocument(file, { html, fetchedAt: Date.now() })
    retryAfter.delete(file)
    return html
  } catch {
    retryAfter.set(file, Date.now() + RETRY_DELAY)
    const lastSuccess = cached ? new Date(cached.fetchedAt).toISOString() : 'none'
    console.warn(`[eRecht24] Could not refresh ${type}/${language}; last successful fetch: ${lastSuccess}.`)
    return cached?.html ?? null
  } finally {
    await release?.().catch(() => {
      console.warn(`[eRecht24] Could not release the lock for ${type}/${language}.`)
    })
  }
}
