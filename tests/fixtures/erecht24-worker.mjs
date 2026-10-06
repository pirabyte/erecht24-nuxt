import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { getERecht24Document } from '../../dist/runtime/server/erecht24.js'

const cacheDir = process.argv[2]
globalThis.fetch = async () => {
  await appendFile(join(cacheDir, 'requests.log'), `${process.pid}\n`)
  await setTimeout(150)
  return Response.json({ html_de: '<p>Shared document</p>' })
}

const html = await getERecht24Document({ apiKey: 'test-api-key', cacheDir }, 'imprint', 'de')
process.stdout.write(JSON.stringify(html))
