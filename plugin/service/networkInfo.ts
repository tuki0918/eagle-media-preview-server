import { networkInterfaces } from "node:os";
import type { LanAddress } from "./qrUrlBuilder.js";

export function getLanAddresses(): LanAddress[] {
  const output: LanAddress[] = [];
  const interfaces = networkInterfaces();

  for (const [label, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      output.push({
        label,
        address: entry.address,
      });
    }
  }

  return output;
}
