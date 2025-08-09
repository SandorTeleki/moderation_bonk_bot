import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const database = require('../utils/database');

const testDbPath = path.join(__dirname, '..', 'test_quota.db');

describe('Database Quota Management', () => {
    beforeAll(async () => {
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        database.dbPath = testDbPath;
        
        await database.initializeDatabase();
    });

    afterAll(async () => {
        await database.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    beforeEach(async () => {
        await new Promise((resolve, reject) => {
            database.db.run('DELETE FROM quotas', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    describe('getQuota', () => {
        it('should return 0 for non-existent guild', async () => {
            const quota = await database.getQuota('non_existent_guild');
            expect(quota).toBe(0);
        });

        it('should return correct quota for existing guild', async () => {
            await database.setQuota('test_guild_123', 15, 'test_user_456', 'TestUser');
            
            const quota = await database.getQuota('test_guild_123');
            expect(quota).toBe(15);
        });

        it('should handle multiple guilds independently', async () => {
            await database.setQuota('guild_1', 10, 'user_1', 'TestUser1');
            await database.setQuota('guild_2', 20, 'user_2', 'TestUser2');
            
            const quota1 = await database.getQuota('guild_1');
            const quota2 = await database.getQuota('guild_2');
            
            expect(quota1).toBe(10);
            expect(quota2).toBe(20);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.getQuota('test_guild');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });
    });

    describe('setQuota', () => {
        it('should set quota for new guild', async () => {
            await database.setQuota('new_guild_123', 25, 'moderator_456', 'TestModerator');
            
            const quota = await database.getQuota('new_guild_123');
            expect(quota).toBe(25);
        });

        it('should update existing quota', async () => {
            await database.setQuota('update_guild_123', 10, 'moderator_1', 'TestMod1');
            let quota = await database.getQuota('update_guild_123');
            expect(quota).toBe(10);
            
            await database.setQuota('update_guild_123', 30, 'moderator_2', 'TestMod2');
            quota = await database.getQuota('update_guild_123');
            expect(quota).toBe(30);
        });

        it('should handle zero quota (disabled)', async () => {
            await database.setQuota('disabled_guild_123', 0, 'moderator_789', 'TestMod');
            
            const quota = await database.getQuota('disabled_guild_123');
            expect(quota).toBe(0);
        });

        it('should store updatedBy information', async () => {
            await database.setQuota('tracked_guild_123', 15, 'specific_moderator_456', 'SpecificMod');
            
            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT updated_by FROM quotas WHERE guild_id = ?',
                    ['tracked_guild_123'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            expect(result.updated_by).toBe('specific_moderator_456');
        });

        it('should update timestamp on quota change', async () => {
            await database.setQuota('timestamp_guild_123', 10, 'moderator_1', 'TestMod1');
            
            const initialResult = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT updated_at FROM quotas WHERE guild_id = ?',
                    ['timestamp_guild_123'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await database.setQuota('timestamp_guild_123', 20, 'moderator_2', 'TestMod2');
            
            const updatedResult = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT updated_at FROM quotas WHERE guild_id = ?',
                    ['timestamp_guild_123'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            expect(initialResult.updated_at).not.toBe(updatedResult.updated_at);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.setQuota('test_guild', 10, 'test_user', 'TestUser');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });

        it('should handle large quota values', async () => {
            const largeQuota = 999999;
            await database.setQuota('large_quota_guild', largeQuota, 'test_moderator', 'TestMod');
            
            const quota = await database.getQuota('large_quota_guild');
            expect(quota).toBe(largeQuota);
        });

        it('should handle negative quota values (edge case)', async () => {
            await database.setQuota('negative_guild', -1, 'test_moderator', 'TestMod');
            
            const quota = await database.getQuota('negative_guild');
            expect(quota).toBe(-1);
        });
    });

    describe('Integration Tests', () => {
        it('should maintain quota persistence across multiple operations', async () => {
            const guildId = 'persistence_test_guild';
            const moderatorId = 'test_moderator';
            
            await database.setQuota(guildId, 5, moderatorId, 'TestMod');
            expect(await database.getQuota(guildId)).toBe(5);
            
            await database.setQuota(guildId, 10, moderatorId, 'TestMod');
            expect(await database.getQuota(guildId)).toBe(10);
            
            await database.setQuota(guildId, 15, moderatorId, 'TestMod');
            expect(await database.getQuota(guildId)).toBe(15);
            
            await database.setQuota(guildId, 0, moderatorId, 'TestMod');
            expect(await database.getQuota(guildId)).toBe(0);
            
            await database.setQuota(guildId, 20, moderatorId, 'TestMod');
            expect(await database.getQuota(guildId)).toBe(20);
        });

        it('should handle concurrent quota operations', async () => {
            const guildId = 'concurrent_test_guild';
            
            const promises = [
                database.setQuota(guildId, 10, 'moderator_1', 'TestMod1'),
                database.setQuota(guildId, 20, 'moderator_2', 'TestMod2'),
                database.setQuota(guildId, 30, 'moderator_3', 'TestMod3')
            ];
            
            await Promise.all(promises);
            
            const finalQuota = await database.getQuota(guildId);
            expect([10, 20, 30]).toContain(finalQuota);
        });
    });
});