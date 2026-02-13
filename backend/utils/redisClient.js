const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    const config = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    };

    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    // Main client for commands
    this.client = redis.createClient(config);
    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    await this.client.connect();

    // Pub/Sub clients (Redis requires separate connections)
    this.pubClient = redis.createClient(config);
    this.pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
    await this.pubClient.connect();

    this.subClient = redis.createClient(config);
    this.subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));
    await this.subClient.connect();

    console.log('✅ Redis connected successfully');
  }

  async disconnect() {
    if (this.client) await this.client.quit();
    if (this.pubClient) await this.pubClient.quit();
    if (this.subClient) await this.subClient.quit();
  }

  // Key namespacing helpers
  getKey(category, identifier, tenantId = null) {
    if (tenantId) {
      return `tenant:${tenantId}:${category}:${identifier}`;
    }
    return `${category}:${identifier}`;
  }

  // Generic operations
  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, expirySeconds = null) {
    if (expirySeconds) {
      return await this.client.set(key, value, { EX: expirySeconds });
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async expire(key, seconds) {
    return await this.client.expire(key, seconds);
  }

  async ttl(key) {
    return await this.client.ttl(key);
  }

  // Hash operations (for structured data)
  async hSet(key, field, value) {
    return await this.client.hSet(key, field, value);
  }

  async hGet(key, field) {
    return await this.client.hGet(key, field);
  }

  async hGetAll(key) {
    return await this.client.hGetAll(key);
  }

  async hDel(key, field) {
    return await this.client.hDel(key, field);
  }

  // Set operations (for collections)
  async sAdd(key, ...members) {
    return await this.client.sAdd(key, members);
  }

  async sMembers(key) {
    return await this.client.sMembers(key);
  }

  async sIsMember(key, member) {
    return await this.client.sIsMember(key, member);
  }

  async sRem(key, ...members) {
    return await this.client.sRem(key, members);
  }

  // List operations (for queues)
  async lPush(key, ...values) {
    return await this.client.lPush(key, values);
  }

  async rPush(key, ...values) {
    return await this.client.rPush(key, values);
  }

  async lPop(key) {
    return await this.client.lPop(key);
  }

  async rPop(key) {
    return await this.client.rPop(key);
  }

  async lRange(key, start, stop) {
    return await this.client.lRange(key, start, stop);
  }

  async lLen(key) {
    return await this.client.lLen(key);
  }

  // Pub/Sub operations
  async publish(channel, message) {
    return await this.pubClient.publish(channel, message);
  }

  async subscribe(channel, callback) {
    await this.subClient.subscribe(channel, callback);
  }

  async unsubscribe(channel) {
    await this.subClient.unsubscribe(channel);
  }

  // Pattern matching
  async keys(pattern) {
    return await this.client.keys(pattern);
  }

  async scan(cursor, pattern, count = 10) {
    return await this.client.scan(cursor, {
      MATCH: pattern,
      COUNT: count
    });
  }
}

// Singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
