import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const database = require('../utils/database.js');

describe('Database Command Usage Tracking', () => {
    beforeEach(async () => {
        database.dbPath = `test_command_usage_${Date.now()}_${Math.random()}.db`;
        await database.initializeDatabase();
    });

    afterEach(async () => {
        if (database && database.db) {
            await database.close();
        }
    });

    describe('incrementCommandUsage', () => {
        it('should increment usage count for new command', async () => {
            const count = await database.incrementCommandUsage('watchlist');
            expect(count).toBe(1);
        });

        it('should increment usage count for existing command', async () => {
            await database.incrementCommandUsage('timeout');
            
            const count = await database.incrementCommandUsage('timeout');
            expect(count).toBe(2);
        });

        it('should handle multiple different commands', async () => {
            await database.incrementCommandUsage('watchlist');
            await database.incrementCommandUsage('timeout');
            await database.incrementCommandUsage('free');
            
            const watchlistCount = await database.incrementCommandUsage('watchlist');
            const timeoutCount = await database.incrementCommandUsage('timeout');
            
            expect(watchlistCount).toBe(2);
            expect(timeoutCount).toBe(2);
        });

        it('should handle concurrent increments for same command', async () => {
            const promises = [
                database.incrementCommandUsage('concurrent_test'),
                database.incrementCommandUsage('concurrent_test'),
                database.incrementCommandUsage('concurrent_test')
            ];
            
            const results = await Promise.all(promises);
            
            expect(results.length).toBe(3);
            results.forEach(result => {
                expect(typeof result).toBe('number');
                expect(result).toBeGreaterThan(0);
            });
        });

        it('should handle database not initialized error', async () => {
            await database.close();
            
            try {
                await database.incrementCommandUsage('test');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Database not initialized');
            }
        });
    });



    describe('integration with other operations', () => {
        it('should track command usage alongside other database operations', async () => {
            await database.setQuota('test_guild', 'TestGuild', 25, 'mod_123', 'TestMod');
            await database.incrementCommandUsage('dailyMessageQuota');
            
            await database.incrementMessageCount('test_guild', 'TestGuild', 'user_456', 'TestUser', '2025-01-01');
            await database.incrementCommandUsage('watchlist');
            
            await database.logAction('test_guild', 'test_action', 'mod_123', 'TestMod', 'user_456', 'TestUser', {});
            await database.incrementCommandUsage('timeout');
            
            const quota = await database.getQuota('test_guild');
            expect(quota).toBe(25);
            
            const messageCount = await database.getMessageCount('test_guild', 'user_456', '2025-01-01');
            expect(messageCount).toBe(1);
        });
    });
});