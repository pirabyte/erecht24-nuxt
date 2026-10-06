import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execute = promisify(execFile)

test('published server entrypoint works without Nuxt or package install scripts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'erecht24-package-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const packed = await execute('npm', ['pack', '--json', '--pack-destination', directory])
  const [artifact] = JSON.parse(packed.stdout)
  for (const file of artifact.files) {
    assert.ok(file.path.startsWith('dist/') || ['package.json', 'README.md', 'LICENSE'].includes(file.path), file.path)
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  await execute('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', join(directory, artifact.filename)], { cwd: directory })
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'))
  for (const dependency of ['nuxt', 'nitropack', '@nuxt/kit', 'h3']) {
    assert.equal(lock.packages[`node_modules/${dependency}`], undefined, dependency)
  }
  await writeFile(join(directory, 'verify.mjs'), `
import assert from 'node:assert/strict'
import { getERecht24Document } from '@pirabyte/erecht24-nuxt/server'
const config = { apiKey: 'private-project-test-key', cacheDir: './cache' }
let requests = 0
globalThis.fetch = async (url, init) => {
  requests++
  assert.equal(url, 'https://api.e-recht24.de/v2/imprint')
  assert.equal(init.headers['eRecht24-api-key'], config.apiKey)
  assert.equal(init.headers['eRecht24-plugin-key'].length, 64)
  assert.equal(init.redirect, 'error')
  return Response.json({ html_de: '<p onclick="unsafe()">Published<script>unsafe()</script></p>' })
}
assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Published</p>')
assert.equal(await getERecht24Document(config, 'imprint', 'de'), '<p>Published</p>')
assert.equal(requests, 1)
`)
  await execute(process.execPath, ['verify.mjs'], { cwd: directory })
  await execute('npm', ['audit', '--omit=dev'], { cwd: directory })
})
