import { networkInterfaces } from "node:os";

export function getLanAddresses() {
  const output = [];
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
