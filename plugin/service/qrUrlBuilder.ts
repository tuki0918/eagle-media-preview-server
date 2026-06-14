export interface LanAddress {
  label: string;
  address: string;
}

export interface AccessUrlOptions {
  preferredLanAddress?: string;
  lanAddresses?: LanAddress[];
  host?: string;
  port?: number;
}

export function selectLanAddress({ preferredLanAddress = "", lanAddresses = [], host = "0.0.0.0" }: AccessUrlOptions = {}) {
  if (preferredLanAddress && lanAddresses.some((entry) => entry.address === preferredLanAddress)) {
    return preferredLanAddress;
  }
  if (host === "127.0.0.1" || host === "localhost") return "localhost";
  if (host && host !== "0.0.0.0") return host;
  if (lanAddresses[0]?.address) return lanAddresses[0].address;
  return "localhost";
}

export function buildAccessUrl({ host = "0.0.0.0", port = 41532, preferredLanAddress = "", lanAddresses = [] }: AccessUrlOptions = {}) {
  const address = selectLanAddress({ preferredLanAddress, lanAddresses, host });
  return `http://${address}:${port}`;
}
