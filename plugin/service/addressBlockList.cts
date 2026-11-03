const { BlockList, isIP } = require("net");

interface BlockedAddress {
  address: string;
  addedAt: number;
}

const MAX_BLOCKED_ADDRESSES = 500;

// Accepts a single address or a CIDR range ("192.168.1.0/24", "fd00::/8"). Entries that overlap
// this machine's loopback (127.0.0.0/8, ::1) are refused, so the admin can never lock out the
// local viewer.
function normalizeBlockedAddress(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  const [rawAddress, rawPrefix, extra] = text.split("/");
  if (!rawAddress || extra !== undefined) throw new Error(`"${text}" is not an IP address or CIDR range`);
  const address = normalizeAddress(rawAddress);
  const family = isIP(address);
  if (!family) throw new Error(`"${text}" is not an IP address or CIDR range`);
  const maxPrefix = family === 4 ? 32 : 128;
  let prefix = maxPrefix;
  if (rawPrefix !== undefined) {
    if (!/^\d{1,3}$/.test(rawPrefix) || Number(rawPrefix) > maxPrefix) throw new Error(`"${text}" has an invalid prefix length`);
    prefix = Number(rawPrefix);
  }
  const normalized = prefix === maxPrefix ? address : `${address}/${prefix}`;
  // An IPv4 entry overlaps 127.0.0.0/8 when it covers it (prefix up to 8) or sits inside it.
  const overlapsLoopback = family === 4
    ? (prefix <= 8 ? createMatcher([normalized])("127.0.0.1") : address.startsWith("127."))
    : createMatcher([normalized])("::1");
  if (overlapsLoopback) throw new Error("Loopback addresses (this computer) cannot be blocked");
  return normalized;
}

function normalizeBlockedAddresses(value: unknown): BlockedAddress[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: BlockedAddress[] = [];
  for (const item of value) {
    const raw = item && typeof item === "object" ? (item as { address?: unknown }).address : item;
    let address = "";
    try {
      address = normalizeBlockedAddress(raw);
    } catch {
      // A hand-edited invalid entry is dropped instead of blocking startup.
      continue;
    }
    if (seen.has(address)) continue;
    seen.add(address);
    const addedAt = Number((item as { addedAt?: unknown })?.addedAt);
    output.push({ address, addedAt: Number.isFinite(addedAt) && addedAt > 0 ? addedAt : 0 });
    if (output.length >= MAX_BLOCKED_ADDRESSES) break;
  }
  return output;
}

function createMatcher(addresses: string[]) {
  const list = new BlockList();
  for (const entry of addresses) {
    const [address, prefix] = entry.split("/");
    const type = isIP(address) === 6 ? "ipv6" : "ipv4";
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return (candidate: string) => {
    const address = normalizeAddress(candidate);
    const family = isIP(address);
    if (!family) return false;
    return list.check(address, family === 6 ? "ipv6" : "ipv4");
  };
}

function createAddressBlockList(initial: Array<BlockedAddress | string> = []) {
  let matcher = createMatcher(normalizeBlockedAddresses(initial).map((entry) => entry.address));
  return {
    isBlocked: (address: string) => Boolean(address) && matcher(address),
    // Applied to the running server immediately; no restart is needed.
    replace(next: Array<BlockedAddress | string>) {
      matcher = createMatcher(normalizeBlockedAddresses(next).map((entry) => entry.address));
    },
  };
}

// Maps an IPv4-mapped IPv6 form ("::ffff:192.168.1.5") to plain IPv4, as sockets report it.
function normalizeAddress(address: string) {
  return String(address || "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
}

module.exports = {
  createAddressBlockList,
  normalizeClientAddress: normalizeAddress,
  normalizeBlockedAddress,
  normalizeBlockedAddresses,
};
