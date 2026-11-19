import { main } from './src/server.mjs';

main().catch(() => { console.error('Presentation service startup failed; check required configuration'); process.exit(1); });
