import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resumePlugin } from '../../scripts/resume-plugin.mjs';

export default defineConfig({
  plugins: [tailwindcss(), resumePlugin()],
  build: { target: 'esnext' },
  server: {
    host: '127.0.0.1', port: 4176, strictPort: true,
    fs: { strict: true, deny: ['.env', '.env.*', '**/_system/private/**', '**/.git/**'] },
  },
});
