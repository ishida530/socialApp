import { lookup as dnsLookup, type LookupAddress } from 'dns';
import { request as httpsRequest } from 'https';
import { BlockList, isIP } from 'net';

// Server-side fetch guards (2026-10-03, security review). Anything the server downloads on a
// user's behalf must not become an open proxy into private networks (SSRF).

const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';

// Media Postfly stored itself: Vercel Blob uploads (https) or local dev uploads (relative path).
export function isOwnMediaSourceUrl(sourceUrl: string): boolean {
  if (sourceUrl.startsWith('/uploads/')) {
    return !sourceUrl.includes('..');
  }

  try {
    const url = new URL(sourceUrl);
    return url.protocol === 'https:' && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

// Two separate lists: a single BlockList matches IPv4 addresses against IPv6 rules such as
// ::ffff:0:0/96, which would block every public IPv4 address.
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback and IPv4-compatible (::a.b.c.d)
  ['64:ff9b::', 96], // NAT64
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6');
}

// ::ffff:127.0.0.1 and its hex form ::ffff:7f00:1 (what the URL parser produces) -> 127.0.0.1.
function mappedIPv4(ipv6: string): string | null {
  const match = /^::ffff:(.+)$/i.exec(ipv6);
  if (!match) return null;
  const tail = match[1];
  if (isIP(tail) === 4) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

// Anything that isn't a well-formed public address counts as private.
export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '');
  const version = isIP(host);
  if (version === 4) {
    return BLOCKED_V4.check(host, 'ipv4');
  }
  if (version === 6) {
    const mapped = mappedIPv4(host);
    if (mapped) {
      return BLOCKED_V4.check(mapped, 'ipv4');
    }
    return BLOCKED_V6.check(host, 'ipv6');
  }
  return true;
}

// DNS lookup used for the actual connection: the address that is validated is the one connected
// to, so a name that re-resolves to a private address between check and connect (DNS rebinding)
// is refused too.
function guardedLookup(
  hostname: string,
  options: object,
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '');
      return;
    }
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      callback(Object.assign(new Error('Adres URL wskazuje na sieć prywatną.'), { code: 'EPRIVATE' }), '');
      return;
    }
    if ((options as { all?: boolean }).all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

// Downloads a URL given by a third party (integration content intake): https only, public hosts
// only (checked at connect time), no redirects, bounded size and time.
export function fetchPublicBytes(rawUrl: string, maxBytes: number, timeoutMs = 15_000) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return Promise.reject(new Error('Nieprawidłowy adres URL.'));
  }
  if (url.protocol !== 'https:') {
    return Promise.reject(new Error('Dozwolone są tylko adresy https://.'));
  }
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname)) {
    return Promise.reject(new Error('Adres URL wskazuje na sieć prywatną.'));
  }

  return new Promise<{ bytes: Buffer; contentType: string | null }>((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET', lookup: guardedLookup, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`Nie udało się pobrać pliku (${status}).`));
        return;
      }
      if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
        res.destroy();
        reject(new Error('Plik jest za duży.'));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          res.destroy();
          reject(new Error('Plik jest za duży.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const contentType = res.headers['content-type'];
        resolve({ bytes: Buffer.concat(chunks), contentType: typeof contentType === 'string' ? contentType : null });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Przekroczono czas pobierania pliku.')));
    req.on('error', reject);
    req.end();
  });
}
