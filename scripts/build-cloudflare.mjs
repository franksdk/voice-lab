import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist-cloudflare', { recursive: true, force: true });
await mkdir('dist-cloudflare/voice-lab', { recursive: true });
await cp('dist-selfhost', 'dist-cloudflare/voice-lab', { recursive: true });
await cp('public/favicon.svg', 'dist-cloudflare/favicon.svg');
