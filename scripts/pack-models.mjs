import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

// Small files avoid stalled large transfers. Keep originals for standard clients.
for (const folder of ['models', 'wasm']) {
  const root = new URL(`../dist/${folder}/`, import.meta.url)
  for (const file of await readdir(root)) {
    if (!/\.(task|wasm)$/.test(file)) continue
    const bytes = gzipSync(await readFile(new URL(file, root)), { level: 6 })
    const target = new URL(`${file}.parts/`, root)
    await mkdir(target, { recursive: true })
    const sizes = []
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      const part = bytes.subarray(offset, offset + 32768)
      await writeFile(new URL(String(sizes.length), target), part)
      sizes.push(part.length)
    }
    await writeFile(new URL('manifest.json', target), JSON.stringify({ sizes }))
  }
}
console.log('Model download parts generated')
