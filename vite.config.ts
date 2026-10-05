import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { normalizePublicSiteUrl, siteMetadataPlugin } from './scripts/site-metadata.ts'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PUBLIC_SITE_URL')
  const siteUrl = normalizePublicSiteUrl(
    env.PUBLIC_SITE_URL ?? (command === 'serve' ? 'http://localhost:5173' : undefined),
  )
  return { plugins: [react(), siteMetadataPlugin(siteUrl)] }
})
