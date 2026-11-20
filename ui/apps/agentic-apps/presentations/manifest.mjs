import { readFileSync } from 'node:fs';

export const PRESENTATIONS_MANIFEST = JSON.parse(readFileSync(new URL('./deploy/app.json', import.meta.url), 'utf8'));
