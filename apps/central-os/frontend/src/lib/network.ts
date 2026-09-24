export type TargetAddressSpace = "local" | undefined;

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

/**
 * Keeps the browser's loopback classification for localhost targets.
 * Private LAN targets still opt into the local address space when needed.
 */
export function targetAddressSpaceFor(url: string): TargetAddressSpace {
  let hostname: string;
  try {
    hostname = new URL(url, "http://localhost").hostname.toLowerCase();
  } catch {
    return undefined;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1") {
    return undefined;
  }
  return isPrivateIpv4(hostname) ? "local" : undefined;
}
