const { domainToASCII } = require("url");

function normalizeCustomDomain(value: unknown = ""): string {
  const input = String(value ?? "").trim();
  if (!input) return "";
  // Accept a hostname only; URL parsing alone would also accept paths and ports.
  const hostname = domainToASCII(input).toLowerCase();
  if (
    /[\s/:\\@?#%*]/.test(input) ||
    !hostname || hostname.length > 253 ||
    !hostname.split(".").every((label: string) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error("Custom hostname must be a hostname only (e.g. hostname.local), without a protocol, port, or path");
  }
  return hostname;
}

module.exports = { normalizeCustomDomain };
