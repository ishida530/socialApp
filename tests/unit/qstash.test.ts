import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublishJSON = vi.fn();
const mockMessagesDelete = vi.fn();
const mockVerify = vi.fn();

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(function Client() {
    return { publishJSON: mockPublishJSON, messages: { delete: mockMessagesDelete } };
  }),
  Receiver: vi.fn().mockImplementation(function Receiver() {
    return { verify: mockVerify };
  }),
}));

const { scheduleQStashPublish, cancelQStashMessage, verifyQStashSignature } = await import('@/lib/server/qstash');
const { Client: MockedClient } = await import('@upstash/qstash');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockPublishJSON.mockReset();
  mockMessagesDelete.mockReset();
  mockVerify.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('scheduleQStashPublish', () => {
  it('returns null without QSTASH_TOKEN, without calling QStash', async () => {
    delete process.env.QSTASH_TOKEN;
    process.env.FRONTEND_URL = 'https://postfly.pl';

    const result = await scheduleQStashPublish('job-1', new Date());

    expect(result).toBeNull();
    expect(mockPublishJSON).not.toHaveBeenCalled();
  });

  it('returns null without FRONTEND_URL even if QSTASH_TOKEN is set', async () => {
    process.env.QSTASH_TOKEN = 'token';
    delete process.env.FRONTEND_URL;

    const result = await scheduleQStashPublish('job-1', new Date());

    expect(result).toBeNull();
    expect(mockPublishJSON).not.toHaveBeenCalled();
  });

  it('calls publishJSON with the trigger URL, jobId, and notBefore as unix seconds', async () => {
    process.env.QSTASH_TOKEN = 'token';
    process.env.FRONTEND_URL = 'https://postfly.pl';
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-123' });

    const notBefore = new Date('2026-09-20T19:00:00Z');
    const result = await scheduleQStashPublish('job-1', notBefore);

    expect(result).toBe('msg-123');
    expect(mockPublishJSON).toHaveBeenCalledWith({
      url: 'https://postfly.pl/api/qstash/trigger-publish',
      body: { jobId: 'job-1' },
      notBefore: Math.floor(notBefore.getTime() / 1000),
    });
  });

  it('returns null (does not throw) if the QStash call fails', async () => {
    process.env.QSTASH_TOKEN = 'token';
    process.env.FRONTEND_URL = 'https://postfly.pl';
    mockPublishJSON.mockRejectedValue(new Error('boom'));

    const result = await scheduleQStashPublish('job-1', new Date());
    expect(result).toBeNull();
  });

  it('passes QSTASH_URL as baseUrl when set (region-pinned instances)', async () => {
    process.env.QSTASH_TOKEN = 'token';
    process.env.FRONTEND_URL = 'https://postfly.pl';
    process.env.QSTASH_URL = 'https://qstash-eu-central-1.upstash.io';
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-1' });

    await scheduleQStashPublish('job-1', new Date());

    expect(vi.mocked(MockedClient)).toHaveBeenCalledWith({
      token: 'token',
      baseUrl: 'https://qstash-eu-central-1.upstash.io',
    });
  });

  it('omits baseUrl (SDK default) when QSTASH_URL is not set', async () => {
    process.env.QSTASH_TOKEN = 'token';
    process.env.FRONTEND_URL = 'https://postfly.pl';
    delete process.env.QSTASH_URL;
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-1' });

    await scheduleQStashPublish('job-1', new Date());

    expect(vi.mocked(MockedClient)).toHaveBeenCalledWith({ token: 'token' });
  });
});

describe('cancelQStashMessage', () => {
  it('is a no-op without QSTASH_TOKEN', async () => {
    delete process.env.QSTASH_TOKEN;
    await cancelQStashMessage('msg-123');
    expect(mockMessagesDelete).not.toHaveBeenCalled();
  });

  it('calls messages.delete with the message id', async () => {
    process.env.QSTASH_TOKEN = 'token';
    mockMessagesDelete.mockResolvedValue(undefined);

    await cancelQStashMessage('msg-123');
    expect(mockMessagesDelete).toHaveBeenCalledWith('msg-123');
  });

  it('does not throw if the delete call fails (already fired / already gone)', async () => {
    process.env.QSTASH_TOKEN = 'token';
    mockMessagesDelete.mockRejectedValue(new Error('not found'));

    await expect(cancelQStashMessage('msg-123')).resolves.toBeUndefined();
  });
});

describe('verifyQStashSignature', () => {
  it('returns false without a signature header', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'a';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'b';

    const result = await verifyQStashSignature(null, 'body');
    expect(result).toBe(false);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns false without signing keys configured', async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    const result = await verifyQStashSignature('sig', 'body');
    expect(result).toBe(false);
  });

  it('delegates to Receiver.verify and returns its result', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'a';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'b';
    mockVerify.mockResolvedValue(true);

    const result = await verifyQStashSignature('sig', 'body');
    expect(result).toBe(true);
    expect(mockVerify).toHaveBeenCalledWith({ signature: 'sig', body: 'body' });
  });

  it('returns false (does not throw) if verify itself throws', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'a';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'b';
    mockVerify.mockRejectedValue(new Error('bad signature'));

    const result = await verifyQStashSignature('sig', 'body');
    expect(result).toBe(false);
  });
});
