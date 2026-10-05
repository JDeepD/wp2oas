import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const indexPath = new URL('../dist/index.html', import.meta.url)
const server = await createServer({
  root: projectRoot,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

try {
  const { render } = await server.ssrLoadModule('/src/prerender.ts') as { render(): string }
  const template = await readFile(indexPath, 'utf8')
  const rootPlaceholder = '<div id="root"></div>'
  if (!template.includes(rootPlaceholder)) {
    throw new Error('The production HTML is missing the prerender root placeholder.')
  }
  const markup = render()
  if (!markup.includes('<h1') || !markup.includes('id="how-it-works-title"')) {
    throw new Error('The prerendered homepage is missing its main content.')
  }
  await writeFile(indexPath, template.replace(rootPlaceholder, () => `<div id="root">${markup}</div>`))
  console.log('Prerendered the homepage into dist/index.html.')
} finally {
  await server.close()
}
