import { createClient } from 'redis';

// Create and configure Redis client
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Connect to Redis
if (!redisClient.isOpen) { 
  await redisClient.connect();
}

// Function to set a key-value pair in Redis
export const setValue = async (key: string, value: string): Promise<void> => {
  await redisClient.set(key, value);
};

// Function to retrieve a value by key from Redis
export const getValue = async (key: string): Promise<string | null> => {
  return redisClient.get(key);
};


export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    await redisClient.set('health', 'ok');
    const reply = await redisClient.get('health');
    return reply === 'ok';
  } catch (error) {
    console.error('Redis Health Check Failed:', error);
    return false;
  }
};
