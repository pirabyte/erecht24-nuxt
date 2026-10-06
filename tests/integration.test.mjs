import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'

test('built Nuxt app renders legal HTML and validates document requests', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'erecht24-nuxt-app-'))
  const listener = createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  await writeFile(join(cacheDir, 'imprint-de.json'), JSON.stringify({
    html: '<h1>Test imprint</h1><p onclick="alert(1)">Cached legal text</p>',
    fetchedAt: Date.now()
  }))
  const server = spawn(process.execPath, ['tests/fixtures/app/.output/server/index.mjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NUXT_ERECHT24_API_KEY: '',
      NUXT_ERECHT24_CACHE_DIR: cacheDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  server.stdout.on('data', data => { output += data })
  server.stderr.on('data', data => { output += data })
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    await rm(cacheDir, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try {
      await fetch(`${base}/api/legal/imprint`)
      ready = true
      break
    } catch {
      await setTimeout(100)
    }
  }
  assert.ok(ready, output)

  const document = await fetch(`${base}/api/legal/imprint`)
  assert.equal(document.status, 200)
  assert.equal(document.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await document.json(), { html: '<h1>Test imprint</h1><p>Cached legal text</p>' })
  for (const path of ['/api/legal/other', '/api/legal/imprint?lang=fr', '/api/legal/imprint?lang=de&lang=en']) {
    assert.equal((await fetch(base + path)).status, 400, path)
  }
  assert.equal((await fetch(`${base}/api/legal/imprint?lang=en`)).status, 503)
  assert.equal((await fetch(`${base}/api/legal/privacyPolicy`)).status, 503)

  const page = await fetch(base)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes('<h1>Test imprint</h1><p>Cached legal text</p>'))
  assert.ok(!html.includes('erecht24ApiKey'))
  assert.ok(!html.includes(cacheDir))
})
