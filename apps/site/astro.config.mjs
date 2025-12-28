import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  // Explicitly disable sessions to avoid KV binding requirement
  session: {
    driver: 'memory',
  },
  vite: {
    build: {
      minify: false,
    },
  },
});
