import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const path = require('path');
const fs = require('fs');

// Test database path
const testDbPath = path.join(__dirname, '..', 'test_integration.db');

// Clean up test database before and after tests
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
  let Database;
  let database;

  beforeEach(async () => {
    // Create a fresh database instance for each test
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

    // Set quota
    await database.setQuota(guildId, quotaLimit, moderatorId);
    
    // Verify quota is set
    const quota1 = await database.getQuota(guildId);
    expect(quota1).toBe(quotaLimit);

    // Close and reopen database (simulating bot restart)
    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    // Verify quota persists
    const quota2 = await newDatabase.getQuota(guildId);
    expect(quota2).toBe(quotaLimit);

    await newDatabase.close();
  });

  it('should persist message counts across database reconnections', async () => {
    const guildId = 'test-guild-123';
    const userId = 'user-456';
    const date = '2024-01-15';

    // Increment message count multiple times
    await database.incrementMessageCount(guildId, userId, date);
    await database.incrementMessageCount(guildId, userId, date);
    await database.incrementMessageCount(guildId, userId, date);
    
    // Verify count
    const count1 = await database.getMessageCount(guildId, userId, date);
    expect(count1).toBe(3);

    // Close and reopen database
    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    // Verify count persists
    const count2 = await newDatabase.getMessageCount(guildId, userId, date);
    expect(count2).toBe(3);

    await newDatabase.close();
  });

  it('should persist audit logs across database reconnections', async () => {
    const guildId = 'test-guild-123';
    const moderatorId = 'moderator-456';
    const targetUserId = 'target-789';

    // Log multiple actions
    await database.logQuotaSet(guildId, moderatorId, 0, 25);
    await database.logTimeout(guildId, moderatorId, targetUserId, 'Spam', 3600000);
    await database.logFree(guildId, moderatorId, targetUserId, 'Appeal accepted');

    // Close and reopen database
    await database.close();
    
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    await newDatabase.initializeDatabase();

    // Verify logs persist by checking database stats
    const stats = await newDatabase.getDatabaseStats();
    expect(stats.logCount).toBe(3);

    await newDatabase.close();
  });

  it('should handle database corruption recovery', async () => {
    const guildId = 'test-guild-123';
    const quotaLimit = 30;

    // Set some data
    await database.setQuota(guildId, quotaLimit, 'moderator-123');
    await database.close();

    // Corrupt the database file
    fs.writeFileSync(testDbPath, 'corrupted data');

    // Try to initialize - should recover
    const newDatabase = new (require('../utils/database.js').constructor)();
    newDatabase.dbPath = testDbPath;
    
    // Should not throw error due to recovery mechanism
    await expect(newDatabase.initializeDatabase()).resolves.not.toThrow();

    // Should be able to use database after recovery
    await newDatabase.setQuota(guildId, 40, 'moderator-456');
    const quota = await newDatabase.getQuota(guildId);
    expect(quota).toBe(40);

    await newDatabase.close();
  });

  it('should handle concurrent database operations', async () => {
    const guildId = 'test-guild-123';
    const userId = 'user-456';
    const date = '2024-01-15';

    // Simulate concurrent message increments
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(database.incrementMessageCount(guildId, userId, date));
    }

    const results = await Promise.all(promises);
    
    // Final count should be 10
    const finalCount = await database.getMessageCount(guildId, userId, date);
    expect(finalCount).toBe(10);

    // All increment operations should have returned increasing values
    expect(results).toHaveLength(10);
    expect(Math.max(...results)).toBe(10);
  });

  it('should load all quotas correctly on startup', async () => {
    // Set quotas for multiple guilds
    await database.setQuota('guild-1', 25, 'mod-1');
    await database.setQuota('guild-2', 50, 'mod-2');
    await database.setQuota('guild-3', 0, 'mod-3'); // Disabled

    // Load all quotas
    const quotaMap = await database.loadAllQuotas();

    expect(quotaMap.size).toBe(3);
    expect(quotaMap.get('guild-1')).toBe(25);
    expect(quotaMap.get('guild-2')).toBe(50);
    expect(quotaMap.get('guild-3')).toBe(0);
  });

  it('should handle database integrity checks', async () => {
    // Check integrity of healthy database
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