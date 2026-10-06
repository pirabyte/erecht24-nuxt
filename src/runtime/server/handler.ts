import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime/config'
import { getERecht24Document, type Config } from './erecht24.js'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const document = getRouterParam(event, 'document')
  const language = getQuery(event).lang ?? 'de'

  if ((document !== 'imprint' && document !== 'privacyPolicy')
    || (language !== 'de' && language !== 'en')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid legal document or language' })
  }

  const runtime = useRuntimeConfig(event)
  const config: Config = {
    apiKey: runtime.erecht24ApiKey,
    cacheDir: runtime.erecht24CacheDir
  }
  const html = await getERecht24Document(config, document, language)
  if (!html) {
    throw createError({ statusCode: 503, statusMessage: 'Legal document unavailable' })
  }
  return { html }
})
