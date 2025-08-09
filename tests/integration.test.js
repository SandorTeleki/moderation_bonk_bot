import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, '..', 'test_integration.db');

beforeEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

afterEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('Integration Tests - Database Persistence', () => {
  let database;

  beforeEach(async () => {
    const DatabaseClass = require('../utils/database.js').constructor;
    database = new DatabaseClass();
    database.dbPath = testDbPath;
    
    await database.initializeDatabase();
  });

  afterEach(async () => {
    if (database && database.db) {
      await database.close();
    }
  });

  it('should persist quota settings across database reconnections', async () => {
    const guildId = 'test-guild-123';
    const moderatorId = 'moderator-456';
    const quotaLimit = 50;

    await database.setQuota(guildId, quotaLimit, moderatorId, 'TestModerator');
    
    const quota1 = await database.getQuota(guildId);
    expect(quota1).toBe(quotaLimit);

    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    const quota2 = await newDatabase.getQuota(guildId);
    expect(quota2).toBe(quotaLimit);

    await newDatabase.close();
  });

  it('should persist message counts across database reconnections', async () => {
    const guildId = 'test-guild-123';
    const userId = 'user-456';
    const date = '2024-01-15';

    await database.incrementMessageCount(guildId, userId, date);
    await database.incrementMessageCount(guildId, userId, date);
    await database.incrementMessageCount(guildId, userId, date);
    
    const count1 = await database.getMessageCount(guildId, userId, date);
    expect(count1).toBe(3);

    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    const count2 = await newDatabase.getMessageCount(guildId, userId, date);
    expect(count2).toBe(3);

    await newDatabase.close();
  });

  it('should persist audit logs across database reconnections', async () => {
    const guildId = 'test-guild-123';
    const moderatorId = 'moderator-456';
    const targetUserId = 'target-789';

    await database.logQuotaSet(guildId, moderatorId, 'TestModerator', 0, 25);
    await database.logTimeout(guildId, moderatorId, 'TestModerator', targetUserId, 'TestUser', 'Spam', 3600000);
    await database.logFree(guildId, moderatorId, 'TestModerator', targetUserId, 'TestUser', 'Appeal accepted');

    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    const stats = await newDatabase.getDatabaseStats();
    expect(stats.logCount).toBe(3);

    await newDatabase.close();
  });

  it('should handle database corruption recovery', async () => {
    const guildId = 'test-guild-123';
    const quotaLimit = 30;

    await database.setQuota(guildId, quotaLimit, 'moderator-123', 'TestModerator');
    await database.close();

    fs.writeFileSync(testDbPath, 'corrupted data');

    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    
    await expect(newDatabase.initializeDatabase()).resolves.not.toThrow();

    await newDatabase.setQuota(guildId, 40, 'moderator-456', 'TestModerator');
    const quota = await newDatabase.getQuota(guildId);
    expect(quota).toBe(40);

    await newDatabase.close();
  });

  it('should handle concurrent database operations', async () => {
    const guildId = 'test-guild-123';
    const userId = 'user-456';
    const date = '2024-01-15';

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(database.incrementMessageCount(guildId, userId, date));
    }

    const results = await Promise.all(promises);
    
    const finalCount = await database.getMessageCount(guildId, userId, date);
    expect(finalCount).toBe(10);

    expect(results).toHaveLength(10);
    expect(Math.max(...results)).toBe(10);
  });

  it('should load all quotas correctly on startup', async () => {
    await database.setQuota('guild-1', 25, 'mod-1', 'TestMod1');
    await database.setQuota('guild-2', 50, 'mod-2', 'TestMod2');
    await database.setQuota('guild-3', 0, 'mod-3', 'TestMod3'); // Disabled

    const quotaMap = await database.loadAllQuotas();

    expect(quotaMap.size).toBe(3);
    expect(quotaMap.get('guild-1')).toBe(25);
    expect(quotaMap.get('guild-2')).toBe(50);
    expect(quotaMap.get('guild-3')).toBe(0);
  });

  it('should handle database integrity checks', async () => {
    const isHealthy = await database.checkIntegrity();
    expect(isHealthy).toBe(true);
  });

  it('should execute operations with retry logic', async () => {
    const guildId = 'test-guild-123';
    let attemptCount = 0;

    // Create an operation that fails twice then succeeds
    const flakyOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('database is locked');
      }
      return database.getQuota(guildId);
    };

    const result = await database.executeWithRetry(flakyOperation);
    expect(result).toBe(0); // Default quota
    expect(attemptCount).toBe(3);
  });
});