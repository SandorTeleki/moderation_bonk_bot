import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const database = require('../utils/database');

// Test database path - use a separate test database
const testDbPath = path.join(__dirname, '..', 'test_message_tracking.db');

describe('Database Message Tracking', () => {
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
        // Clear daily_messages table before each test
        await new Promise((resolve, reject) => {
            database.db.run('DELETE FROM daily_messages', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    describe('getMessageCount', () => {
        it('should return 0 for non-existent user/date combination', async () => {
            const count = await database.getMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(0);
        });

        it('should return correct count for existing user/date', async () => {
            // First increment count to create record
            await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            
            // Then retrieve count
            const count = await database.getMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(2);
        });

        it('should handle different dates independently', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            
            // Increment for different dates
            await database.incrementMessageCount(guildId, userId, '2024-01-01');
            await database.incrementMessageCount(guildId, userId, '2024-01-01');
            await database.incrementMessageCount(guildId, userId, '2024-01-02');
            
            // Verify counts are independent
            const count1 = await database.getMessageCount(guildId, userId, '2024-01-01');
            const count2 = await database.getMessageCount(guildId, userId, '2024-01-02');
            
            expect(count1).toBe(2);
            expect(count2).toBe(1);
        });

        it('should handle different users independently', async () => {
            const guildId = 'guild_123';
            const date = '2024-01-01';
            
            // Increment for different users
            await database.incrementMessageCount(guildId, 'user_1', date);
            await database.incrementMessageCount(guildId, 'user_1', date);
            await database.incrementMessageCount(guildId, 'user_2', date);
            
            // Verify counts are independent
            const count1 = await database.getMessageCount(guildId, 'user_1', date);
            const count2 = await database.getMessageCount(guildId, 'user_2', date);
            
            expect(count1).toBe(2);
            expect(count2).toBe(1);
        });

        it('should handle different guilds independently', async () => {
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // Increment for different guilds
            await database.incrementMessageCount('guild_1', userId, date);
            await database.incrementMessageCount('guild_1', userId, date);
            await database.incrementMessageCount('guild_2', userId, date);
            
            // Verify counts are independent
            const count1 = await database.getMessageCount('guild_1', userId, date);
            const count2 = await database.getMessageCount('guild_2', userId, date);
            
            expect(count1).toBe(2);
            expect(count2).toBe(1);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.getMessageCount('guild_123', 'user_456', '2024-01-01');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });
    });

    describe('incrementMessageCount', () => {
        it('should create new record with count 1 for first message', async () => {
            const count = await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(1);
            
            // Verify it was stored correctly
            const storedCount = await database.getMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(storedCount).toBe(1);
        });

        it('should increment existing count', async () => {
            // First message
            let count = await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(1);
            
            // Second message
            count = await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(2);
            
            // Third message
            count = await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
            expect(count).toBe(3);
        });

        it('should handle multiple increments correctly', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // Increment multiple times
            for (let i = 1; i <= 10; i++) {
                const count = await database.incrementMessageCount(guildId, userId, date);
                expect(count).toBe(i);
            }
            
            // Verify final count
            const finalCount = await database.getMessageCount(guildId, userId, date);
            expect(finalCount).toBe(10);
        });

        it('should update last_updated timestamp', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // First increment
            await database.incrementMessageCount(guildId, userId, date);
            
            // Get initial timestamp
            const initialResult = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT last_updated FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?',
                    [guildId, userId, date],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            // Wait a moment to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Second increment
            await database.incrementMessageCount(guildId, userId, date);
            
            // Get updated timestamp
            const updatedResult = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT last_updated FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?',
                    [guildId, userId, date],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            // Timestamps should be different
            expect(initialResult.last_updated).not.toBe(updatedResult.last_updated);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.incrementMessageCount('guild_123', 'user_456', '2024-01-01');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });
    });

    describe('resetMessageCount', () => {
        it('should reset existing count to 0', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // First increment count
            await database.incrementMessageCount(guildId, userId, date);
            await database.incrementMessageCount(guildId, userId, date);
            let count = await database.getMessageCount(guildId, userId, date);
            expect(count).toBe(2);
            
            // Reset count
            await database.resetMessageCount(guildId, userId, date);
            count = await database.getMessageCount(guildId, userId, date);
            expect(count).toBe(0);
        });

        it('should create new record with count 0 if none exists', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // Reset count for non-existent record
            await database.resetMessageCount(guildId, userId, date);
            
            // Verify count is 0
            const count = await database.getMessageCount(guildId, userId, date);
            expect(count).toBe(0);
        });

        it('should update last_updated timestamp', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // Create initial record
            await database.incrementMessageCount(guildId, userId, date);
            
            // Wait a moment to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Reset count
            await database.resetMessageCount(guildId, userId, date);
            
            // Verify timestamp was updated
            const result = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT last_updated FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?',
                    [guildId, userId, date],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            expect(result).toBeTruthy();
            expect(result.last_updated).toBeTruthy();
        });

        it('should allow incrementing after reset', async () => {
            const guildId = 'guild_123';
            const userId = 'user_456';
            const date = '2024-01-01';
            
            // Increment, reset, then increment again
            await database.incrementMessageCount(guildId, userId, date);
            await database.resetMessageCount(guildId, userId, date);
            const count = await database.incrementMessageCount(guildId, userId, date);
            
            expect(count).toBe(1);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.resetMessageCount('guild_123', 'user_456', '2024-01-01');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });
    });

    describe('Integration Tests', () => {
        it('should handle complex message tracking scenario', async () => {
            const guildId = 'integration_guild';
            const userId = 'integration_user';
            const date1 = '2024-01-01';
            const date2 = '2024-01-02';
            
            // Day 1: Send 5 messages
            for (let i = 1; i <= 5; i++) {
                const count = await database.incrementMessageCount(guildId, userId, date1);
                expect(count).toBe(i);
            }
            
            // Day 2: Send 3 messages
            for (let i = 1; i <= 3; i++) {
                const count = await database.incrementMessageCount(guildId, userId, date2);
                expect(count).toBe(i);
            }
            
            // Verify counts
            expect(await database.getMessageCount(guildId, userId, date1)).toBe(5);
            expect(await database.getMessageCount(guildId, userId, date2)).toBe(3);
            
            // Reset day 1
            await database.resetMessageCount(guildId, userId, date1);
            expect(await database.getMessageCount(guildId, userId, date1)).toBe(0);
            expect(await database.getMessageCount(guildId, userId, date2)).toBe(3); // Should remain unchanged
            
            // Continue on day 1 after reset
            const newCount = await database.incrementMessageCount(guildId, userId, date1);
            expect(newCount).toBe(1);
        });

        it('should handle multiple users and guilds simultaneously', async () => {
            const date = '2024-01-01';
            
            // Set up test data
            const testCases = [
                { guild: 'guild_1', user: 'user_1', expectedCount: 3 },
                { guild: 'guild_1', user: 'user_2', expectedCount: 2 },
                { guild: 'guild_2', user: 'user_1', expectedCount: 4 },
                { guild: 'guild_2', user: 'user_2', expectedCount: 1 }
            ];
            
            // Increment messages for each test case
            for (const testCase of testCases) {
                for (let i = 0; i < testCase.expectedCount; i++) {
                    await database.incrementMessageCount(testCase.guild, testCase.user, date);
                }
            }
            
            // Verify all counts are correct
            for (const testCase of testCases) {
                const count = await database.getMessageCount(testCase.guild, testCase.user, date);
                expect(count).toBe(testCase.expectedCount);
            }
        });

        it('should handle concurrent operations on same record', async () => {
            const guildId = 'concurrent_guild';
            const userId = 'concurrent_user';
            const date = '2024-01-01';
            
            // Perform multiple concurrent increments
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(database.incrementMessageCount(guildId, userId, date));
            }
            
            const results = await Promise.all(promises);
            
            // All operations should succeed and return valid counts
            results.forEach(count => {
                expect(count).toBeGreaterThan(0);
                expect(count).toBeLessThanOrEqual(10);
            });
            
            // Final count should be 10
            const finalCount = await database.getMessageCount(guildId, userId, date);
            expect(finalCount).toBe(10);
        });

        it('should maintain data integrity across operations', async () => {
            const guildId = 'integrity_guild';
            const userId = 'integrity_user';
            const date = '2024-01-01';
            
            // Perform mixed operations
            await database.incrementMessageCount(guildId, userId, date); // 1
            await database.incrementMessageCount(guildId, userId, date); // 2
            await database.resetMessageCount(guildId, userId, date);     // 0
            await database.incrementMessageCount(guildId, userId, date); // 1
            await database.incrementMessageCount(guildId, userId, date); // 2
            await database.incrementMessageCount(guildId, userId, date); // 3
            
            const finalCount = await database.getMessageCount(guildId, userId, date);
            expect(finalCount).toBe(3);
            
            // Verify database record exists and is correct
            const dbRecord = await new Promise((resolve, reject) => {
                database.db.get(
                    'SELECT * FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?',
                    [guildId, userId, date],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            expect(dbRecord).toBeTruthy();
            expect(dbRecord.message_count).toBe(3);
            expect(dbRecord.guild_id).toBe(guildId);
            expect(dbRecord.user_id).toBe(userId);
            expect(dbRecord.date).toBe(date);
        });
    });

    describe('cleanupOldMessages', () => {
        it('should remove message records older than specified days', async () => {
            const guildId = 'cleanup_guild_123';
            const userId = 'cleanup_user_456';
            
            // Create test records with different dates
            const oldDate1 = '2024-01-01'; // 40+ days old
            const oldDate2 = '2024-01-02'; // 40+ days old
            const recentDate = new Date().toISOString().split('T')[0]; // Today
            
            // Add message counts for different dates
            await database.incrementMessageCount(guildId, userId, oldDate1);
            await database.incrementMessageCount(guildId, userId, oldDate2);
            await database.incrementMessageCount(guildId, userId, recentDate);
            
            // Verify all records exist
            expect(await database.getMessageCount(guildId, userId, oldDate1)).toBe(1);
            expect(await database.getMessageCount(guildId, userId, oldDate2)).toBe(1);
            expect(await database.getMessageCount(guildId, userId, recentDate)).toBe(1);
            
            // Clean up messages older than 30 days
            const deletedCount = await database.cleanupOldMessages(30);
            
            expect(deletedCount).toBe(2);
            
            // Verify old records are gone but recent record remains
            expect(await database.getMessageCount(guildId, userId, oldDate1)).toBe(0);
            expect(await database.getMessageCount(guildId, userId, oldDate2)).toBe(0);
            expect(await database.getMessageCount(guildId, userId, recentDate)).toBe(1);
        });

        it('should not remove records within the retention period', async () => {
            const guildId = 'cleanup_guild_456';
            const userId = 'cleanup_user_789';
            const recentDate = new Date().toISOString().split('T')[0]; // Today
            
            // Add a recent message count
            await database.incrementMessageCount(guildId, userId, recentDate);
            
            // Try to clean up messages older than 1 day
            const deletedCount = await database.cleanupOldMessages(1);
            
            expect(deletedCount).toBe(0);
            
            // Verify record still exists
            expect(await database.getMessageCount(guildId, userId, recentDate)).toBe(1);
        });

        it('should reject when database is not initialized', async () => {
            const originalDb = database.db;
            database.db = null;
            
            try {
                await database.cleanupOldMessages(7);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            } finally {
                database.db = originalDb;
            }
        });

        it('should use default retention period of 7 days', async () => {
            const guildId = 'cleanup_default_guild';
            const userId = 'cleanup_default_user';
            
            // Create a record that's 10 days old
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 10);
            const oldDateStr = oldDate.toISOString().split('T')[0];
            
            await database.incrementMessageCount(guildId, userId, oldDateStr);
            
            // Clean up with default retention (7 days)
            const deletedCount = await database.cleanupOldMessages();
            
            expect(deletedCount).toBe(1);
            expect(await database.getMessageCount(guildId, userId, oldDateStr)).toBe(0);
        });
    });
});