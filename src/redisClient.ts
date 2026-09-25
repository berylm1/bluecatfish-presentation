import { createClient } from 'redis';

// Create and configure Redis client.
// Without a URL the client would try localhost forever, so no REDIS_URL = no cache.
// Give up after a few quick retries: node-redis otherwise retries forever and
// every lesson request hangs until Vercel kills it.
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => (retries >= 3 ? new Error('Redis unreachable') : 500),
  },
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));

let connecting: Promise<void> | null = null;

// Connect lazily — a top-level await here hangs Next.js page-data collection
// during builds (and fails when no Redis is reachable at build time).
async function ensureConnected(): Promise<void> {
  if (!process.env.REDIS_URL || redisClient.isReady) return;
  if (!connecting) {
    connecting = redisClient
      .connect()
      .then(() => undefined)
      .catch((err) => {
        console.warn('Redis connect failed (cache disabled):', (err as Error).message);
      })
      .finally(() => {
        connecting = null;
      });
  }
  await connecting;
}

// Function to set a key-value pair in Redis
export const setValue = async (key: string, value: string): Promise<void> => {
  await ensureConnected();
  if (!redisClient.isReady) return;          // Redis unreachable: skip caching instead of crashing
  await redisClient.set(key, value).catch((err) => console.warn('Redis set failed:', err.message));
};

// Function to retrieve a value by key from Redis
export const getValue = async (key: string): Promise<string | null> => {
  await ensureConnected();
  if (!redisClient.isReady) return null;     // Redis unreachable: behave like a cache miss
  return redisClient.get(key).catch((err) => {
    console.warn('Redis get failed:', err.message);
    return null;
  });
};


export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    await ensureConnected();
    if (!redisClient.isReady) return false;
    await redisClient.set('health', 'ok');
    const reply = await redisClient.get('health');
    return reply === 'ok';
  } catch (error) {
    console.error('Redis Health Check Failed:', error);
    return false;
  }
};
