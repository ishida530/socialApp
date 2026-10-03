import { describe, expect, it } from 'vitest';
import { fetchPublicBytes, isOwnMediaSourceUrl, isPrivateAddress } from '@/lib/server/url-safety';

// SSRF guards (2026-10-03, security review).

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    'fc00::1',
    'fe80::1',
    '[::1]',
    'not-an-ip',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('treats %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('isOwnMediaSourceUrl', () => {
  it('accepts Postfly storage only', () => {
    expect(isOwnMediaSourceUrl('https://abc.public.blob.vercel-storage.com/uploads/a.mp4')).toBe(true);
    expect(isOwnMediaSourceUrl('/uploads/videos/a.mp4')).toBe(true);
    expect(isOwnMediaSourceUrl('http://abc.public.blob.vercel-storage.com/a.mp4')).toBe(false);
    expect(isOwnMediaSourceUrl('https://evil.example.com/blob.vercel-storage.com/a.mp4')).toBe(false);
    expect(isOwnMediaSourceUrl('https://blob.vercel-storage.com.evil.com/a.mp4')).toBe(false);
    expect(isOwnMediaSourceUrl('/uploads/../../etc/passwd')).toBe(false);
    expect(isOwnMediaSourceUrl('http://169.254.169.254/latest')).toBe(false);
  });
});

describe('fetchPublicBytes', () => {
  it('refuses non-https and private literal hosts before any connection', async () => {
    await expect(fetchPublicBytes('http://example.com/a.jpg', 1000)).rejects.toThrow(/https/);
    await expect(fetchPublicBytes('https://127.0.0.1/a.jpg', 1000)).rejects.toThrow(/prywatn/);
    await expect(fetchPublicBytes('https://[::ffff:127.0.0.1]/a.jpg', 1000)).rejects.toThrow(/prywatn/);
    await expect(fetchPublicBytes('not a url', 1000)).rejects.toThrow(/Nieprawidłowy/);
  });
});
