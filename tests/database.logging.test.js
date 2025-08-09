import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const database = require('../utils/database');

// Test database path - use a separate test database
const testDbPath = path.join(__dirname, '..', 'test_logging.db');

describe('Database Logging Operations', () => {
    beforeAll(async () => {
        // Clean up any existing test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        // Override the database path for testing
        database.dbPath = testDbPath;
        
        // Initialize the test database
        await database.initializeDatabase();
    });

    afterAll(async () => {
        // Close database connection and clean up test database
        await database.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    beforeEach(async () => {
        // Clear logs table before each test
        await new Promise((resolve, reject) => {
            database.db.run('DELETE FROM logs', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    describe('logAction', () => {
        it('should log basic action with all parameters', async () => {
            const guildId = 'test_guild_123';
            const actionType = 'test_action';
            const moderatorId = 'moderator_456';
            const targetUserId = 'target_789';
            const details = { test: 'data', value: 42 };

            await database.logAction(guildId, actionType, moderatorId, targetUserId, details);

            // Verify the log was created
            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE guild_id = ? AND action_type = ?',
                    [guildId, actionType],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.guild_id).toBe(guildId);
            expect(result.action_type).toBe(actionType);
            expect(result.moderator_id).toBe(moderatorId);
            expect(result.target_user_id).toBe(targetUserId);
            expect(JSON.parse(result.details)).toEqual(details);
            expect(result.timestamp).toBeTruthy();
        });

        it('should handle null moderator for automatic actions', async () => {
            await database.logAction('guild_123', 'auto_action', null, 'user_456', { auto: true });

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ?',
                    ['auto_action'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result.moderator_id).toBeNull();
            expect(result.target_user_id).toBe('user_456');
        });

        it('should handle null target user', async () => {
            await database.logAction('guild_123', 'system_action', 'mod_456', null, { system: true });

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ?',
                    ['system_action'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result.moderator_id).toBe('mod_456');
            expect(result.target_user_id).toBeNull();
        });

        it('should handle null details', async () => {
            await database.logAction('guild_123', 'simple_action', 'mod_456', 'user_789', null);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ?',
                    ['simple_action'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result.details).toBeNull();
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.logAction('guild', 'action', 'mod', 'user', {});
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });
    });

    describe('logQuotaSet', () => {
        it('should log quota setting with old and new values', async () => {
            const guildId = 'quota_guild_123';
            const moderatorId = 'mod_456';
            const oldQuota = 10;
            const newQuota = 20;

            await database.logQuotaSet(guildId, moderatorId, oldQuota, newQuota);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['quota_set', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.action_type).toBe('quota_set');
            expect(result.moderator_id).toBe(moderatorId);
            expect(result.target_user_id).toBeNull();
            
            const details = JSON.parse(result.details);
            expect(details.oldQuota).toBe(oldQuota);
            expect(details.newQuota).toBe(newQuota);
        });
    });

    describe('logTimeout', () => {
        it('should log timeout action with reason and duration', async () => {
            const guildId = 'timeout_guild_123';
            const moderatorId = 'mod_456';
            const targetUserId = 'user_789';
            const reason = 'Spam violation';
            const duration = 3600000; // 1 hour in ms

            await database.logTimeout(guildId, moderatorId, targetUserId, reason, duration);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['timeout', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.action_type).toBe('timeout');
            expect(result.moderator_id).toBe(moderatorId);
            expect(result.target_user_id).toBe(targetUserId);
            
            const details = JSON.parse(result.details);
            expect(details.reason).toBe(reason);
            expect(details.duration).toBe(duration);
        });
    });

    describe('logFree', () => {
        it('should log free action with reason', async () => {
            const guildId = 'free_guild_123';
            const moderatorId = 'mod_456';
            const targetUserId = 'user_789';
            const reason = 'Appeal approved';

            await database.logFree(guildId, moderatorId, targetUserId, reason);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['free', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.action_type).toBe('free');
            expect(result.moderator_id).toBe(moderatorId);
            expect(result.target_user_id).toBe(targetUserId);
            
            const details = JSON.parse(result.details);
            expect(details.reason).toBe(reason);
        });
    });

    describe('logAutoTimeout', () => {
        it('should log automatic timeout with message count and quota limit', async () => {
            const guildId = 'auto_guild_123';
            const targetUserId = 'user_789';
            const messageCount = 25;
            const quotaLimit = 20;

            await database.logAutoTimeout(guildId, targetUserId, messageCount, quotaLimit);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['auto_timeout', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.action_type).toBe('auto_timeout');
            expect(result.moderator_id).toBeNull(); // Automatic action
            expect(result.target_user_id).toBe(targetUserId);
            
            const details = JSON.parse(result.details);
            expect(details.messageCount).toBe(messageCount);
            expect(details.quotaLimit).toBe(quotaLimit);
        });
    });

    describe('logQuotaReset', () => {
        it('should log quota reset with moderator', async () => {
            const guildId = 'reset_guild_123';
            const moderatorId = 'mod_456';
            const targetUserId = 'user_789';
            const reason = 'Manual reset requested';

            await database.logQuotaReset(guildId, moderatorId, targetUserId, reason);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['quota_reset', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.action_type).toBe('quota_reset');
            expect(result.moderator_id).toBe(moderatorId);
            expect(result.target_user_id).toBe(targetUserId);
            
            const details = JSON.parse(result.details);
            expect(details.reason).toBe(reason);
        });

        it('should log automatic quota reset', async () => {
            const guildId = 'auto_reset_guild_123';
            const targetUserId = 'user_789';
            const reason = 'Daily reset';

            await database.logQuotaReset(guildId, null, targetUserId, reason);

            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM logs WHERE action_type = ? AND guild_id = ?',
                    ['quota_reset', guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            expect(result).toBeTruthy();
            expect(result.moderator_id).toBeNull(); // Automatic action
        });
    });

    describe('Integration Tests', () => {
        it('should handle multiple log types for the same guild', async () => {
            const guildId = 'multi_log_guild';
            const moderatorId = 'mod_123';
            const targetUserId = 'user_456';

            // Log different types of actions
            await database.logQuotaSet(guildId, moderatorId, 0, 15);
            await database.logTimeout(guildId, moderatorId, targetUserId, 'Spam', 3600000);
            await database.logAutoTimeout(guildId, targetUserId, 20, 15);
            await database.logFree(guildId, moderatorId, targetUserId, 'Appeal approved');
            await database.logQuotaReset(guildId, moderatorId, targetUserId, 'Manual reset');

            // Verify all logs were created
            const logCount = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT COUNT(*) as count FROM logs WHERE guild_id = ?',
                    [guildId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    }
                );
            });
            expect(logCount).toBe(5);

            // Verify different action types exist
            const actionTypes = await new Promise((resolve, reject) => {
                database.db.all(
                    'SELECT DISTINCT action_type FROM logs WHERE guild_id = ? ORDER BY action_type',
                    [guildId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows.map(row => row.action_type));
                    }
                );
            });
            expect(actionTypes).toEqual(['auto_timeout', 'free', 'quota_reset', 'quota_set', 'timeout']);
        });

        it('should maintain log chronological order', async () => {
            const guildId = 'chrono_guild';
            
            // Add logs with small delays to ensure different timestamps
            await database.logAction(guildId, 'first_action', 'mod_1', null, {});
            await new Promise(resolve => setTimeout(resolve, 10));
            
            await database.logAction(guildId, 'second_action', 'mod_2', null, {});
            await new Promise(resolve => setTimeout(resolve, 10));
            
            await database.logAction(guildId, 'third_action', 'mod_3', null, {});

            // Retrieve logs in chronological order
            const logs = await new Promise((resolve, reject) => {
                database.db.all(
                    'SELECT action_type, timestamp FROM logs WHERE guild_id = ? ORDER BY timestamp',
                    [guildId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            expect(logs).toHaveLength(3);
            expect(logs[0].action_type).toBe('first_action');
            expect(logs[1].action_type).toBe('second_action');
            expect(logs[2].action_type).toBe('third_action');
            
            // Verify timestamps are in ascending order
            expect(logs[0].timestamp <= logs[1].timestamp).toBe(true);
            expect(logs[1].timestamp <= logs[2].timestamp).toBe(true);
        });
    });
});