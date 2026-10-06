import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test, type TestContext } from 'node:test'
import { getERecht24Document } from '@pirabyte/erecht24-nuxt/server'

const execute = promisify(execFile)

async function setup(t: TestContext) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'erecht24-nuxt-'))
  t.after(() => rm(cacheDir, { recursive: true, force: true }))
  t.mock.method(console, 'warn', () => {})
  return { apiKey: 'test-api-key', cacheDir }
}

test('stores sanitized documents per language and serves fresh files without an API call', async (t) => {
  const config = await setup(t)
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.e-recht24.de/v2/imprint')
    assert.equal(init.headers['eRecht24-api-key'], config.apiKey)
    assert.ok(init.headers['eRecht24-plugin-key'])
    assert.equal(init.redirect, 'error')
    return Response.json({
      html_de: '<p onclick="alert(1)">Deutsch<script>secret()</script><img src="https://tracker.invalid/pixel"></p>',
      html_en: '<p>English <a href="javascript:alert(1)" target="_blank">link</a></p>'
    })
  })

  assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Deutsch</p>')
  assert.equal(await getERecht24Document(config, 'imprint', 'en'), '<p>English <a target="_blank" rel="noopener noreferrer">link</a></p>')
  assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Deutsch</p>')
  assert.equal(fetch.mock.callCount(), 2)
  assert.deepEqual((await readdir(config.cacheDir)).sort(), ['imprint-de.json', 'imprint-en.json'])
  const saved = JSON.parse(await readFile(join(config.cacheDir, 'imprint-de.json'), 'utf8'))
  assert.deepEqual(Object.keys(saved).sort(), ['fetchedAt', 'html'])
  assert.equal(saved.html, '<p>Deutsch</p>')
  assert.ok(Date.now() - saved.fetchedAt < 5_000)
})

test('refreshes an expired file and preserves the other document', async (t) => {
  const config = await setup(t)
  const old = JSON.stringify({ html: '<p>Old</p>', fetchedAt: Date.now() - 49 * 60 * 60 * 1000 })
  const file = join(config.cacheDir, 'privacyPolicy-de.json')
  await writeFile(file, old)
  await writeFile(join(config.cacheDir, 'imprint-de.json'), old)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ html_de: '<p>Updated</p>' }))

  assert.equal(await getERecht24Document(config, 'privacyPolicy', 'de'), '<p>Updated</p>')
  assert.equal(JSON.parse(await readFile(file, 'utf8')).html, '<p>Updated</p>')
  assert.equal(await readFile(join(config.cacheDir, 'imprint-de.json'), 'utf8'), old)
})

test('keeps the last successful file unchanged during upstream failures and limits retries', async (t) => {
  const failures = [
    { name: 'HTTP error', fetch: async () => new Response('', { status: 503 }) },
    { name: 'timeout', fetch: async () => { throw new DOMException('Timed out', 'TimeoutError') } },
    { name: 'invalid JSON', fetch: async () => new Response('not json') },
    { name: 'missing language', fetch: async () => Response.json({ html_de: '<p>Deutsch</p>' }) },
    { name: 'unsafe HTML only', fetch: async () => Response.json({ html_en: '<script>alert(1)</script>' }) },
    { name: 'empty markup', fetch: async () => Response.json({ html_en: '<p> &nbsp; <br></p>' }) },
    { name: 'invalid shape', fetch: async () => Response.json({ html_en: { html: '<p>Wrong</p>' } }) }
  ]

  for (const failure of failures) {
    await t.test(failure.name, async (t) => {
      const config = await setup(t)
      const file = join(config.cacheDir, 'privacyPolicy-en.json')
      const old = JSON.stringify({ html: '<p>Last working English version</p>', fetchedAt: Date.now() - 90 * 24 * 60 * 60 * 1000 })
      await writeFile(file, old)
      const fetch = t.mock.method(globalThis, 'fetch', failure.fetch)

      assert.equal(await getERecht24Document(config, 'privacyPolicy', 'en'), '<p>Last working English version</p>')
      assert.equal(await getERecht24Document(config, 'privacyPolicy', 'en'), '<p>Last working English version</p>')
      assert.equal(await readFile(file, 'utf8'), old)
      assert.equal(fetch.mock.callCount(), 1)
    })
  }
})

test('uses disk without credentials, and returns null if there is no usable file', async (t) => {
  const config = { ...await setup(t), apiKey: '' }
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch') })
  const file = join(config.cacheDir, 'imprint-de.json')
  assert.equal(await getERecht24Document(config, 'imprint', 'de'), null)
  await writeFile(file, JSON.stringify({ html: '<p>Saved</p>', fetchedAt: Date.now() - 90 * 24 * 60 * 60 * 1000 }))
  assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Saved</p>')
  await writeFile(file, '{broken')
  assert.equal(await getERecht24Document(config, 'imprint', 'de'), null)
  assert.equal(fetch.mock.callCount(), 0)
})

test('rejects invalid document names and languages before fetching or writing files', async (t) => {
  const config = await setup(t)
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch') })
  for (const [document, language] of [
    ['../../outside', 'de'],
    ['imprint', '../../outside'],
    ['clients', 'de'],
    ['imprint', 'fr']
  ]) {
    // JavaScript consumers can bypass the TypeScript union types.
    await assert.rejects(getERecht24Document(config, document as 'imprint', language as 'de'), TypeError)
  }
  assert.deepEqual(await readdir(config.cacheDir), [])
  assert.equal(fetch.mock.callCount(), 0)
})

test('returns the last working text if storage cannot be updated', async (t) => {
  const config = await setup(t)
  const file = join(config.cacheDir, 'imprint-de.json')
  const old = JSON.stringify({ html: '<p>Saved</p>', fetchedAt: Date.now() - 49 * 60 * 60 * 1000 })
  await writeFile(file, old)
  // A non-directory lock path makes storage locking fail without permission-dependent tests.
  await writeFile(`${file}.lock`, 'unavailable')
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ html_de: '<p>New</p>' }))

  assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Saved</p>')
  assert.equal(await readFile(file, 'utf8'), old)
  assert.equal(fetch.mock.callCount(), 0)
})

test('shares the persisted snapshot across independent processes and serializes refreshes', async (t) => {
  const config = await setup(t)
  await mkdir(config.cacheDir, { recursive: true })
  const worker = new URL('./fixtures/erecht24-worker.mjs', import.meta.url)
  const calls = await Promise.all(Array.from({ length: 4 }, () => execute(process.execPath, [worker.pathname, config.cacheDir])))

  for (const result of calls) assert.equal(JSON.parse(result.stdout), '<p>Shared document</p>')
  const requests = await readFile(join(config.cacheDir, 'requests.log'), 'utf8')
  assert.equal(requests.trim().split('\n').length, 1)
  const restarted = await execute(process.execPath, [worker.pathname, config.cacheDir])
  assert.equal(JSON.parse(restarted.stdout), '<p>Shared document</p>')
  assert.equal(await readFile(join(config.cacheDir, 'requests.log'), 'utf8'), requests)
})
