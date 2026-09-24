import 'dotenv/config';
import { networkInterfaces } from 'os';

import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

function getLanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return null;
}

app.listen(env.port, () => {
  console.log(`Astro108 backend listening on http://localhost:${env.port}`);

  const lanAddress = getLanAddress();
  if (lanAddress) {
    console.log(
      `  Reachable from a physical device on the same WiFi at http://${lanAddress}:${env.port}`,
    );
    console.log(`  Make sure EXPO_PUBLIC_API_URL in .env matches that address.`);
  }
});
