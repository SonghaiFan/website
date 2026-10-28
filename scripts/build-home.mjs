import { mkdir, writeFile, cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'apps/home/.site-dist')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(path.join(root, 'apps/home', 'index.html'), path.join(output, 'index.html'))
await cp(path.join(root, 'apps/home', 'site.css'), path.join(output, 'site.css'))
await cp(path.join(root, 'apps/home', 'app.js'), path.join(output, 'app.js'))
await cp(path.join(root, 'apps/home', 'engagement.js'), path.join(output, 'engagement.js'))
await cp(path.join(root, 'apps/home', 'favicon.svg'), path.join(output, 'favicon.svg'))
await cp(path.join(root, 'apps/home', 'assets'), path.join(output, 'assets'), { recursive: true })
await writeFile(path.join(output, 'CNAME'), 'songhai.site\n')
await writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://songhai.site/sitemap.xml\n')
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://songhai.site/</loc>
  </url>
</urlset>
`)

console.log('Built Frank Home')
