const database = require('./utils/database');
const fs = require('fs');
const path = require('path');

// Test database path - use a separate test database
const testDbPath = path.join(__dirname, 'test_quota_manual.db');

async function runQuotaTests() {
    console.log('🧪 Starting quota management tests...\n');
    
    try {
        // Clean up any existing test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        // Override the database path for testing
        database.dbPath = testDbPath;
        
        // Initialize the test database
        await database.initializeDatabase();
        console.log('✅ Database initialized successfully');
        
        // Test 1: getQuota for non-existent guild should return 0
        console.log('\n📋 Test 1: getQuota for non-existent guild');
        const nonExistentQuota = await database.getQuota('non_existent_guild');
        console.log(`Result: ${nonExistentQuota}`);
        if (nonExistentQuota === 0) {
            console.log('✅ PASS: Returns 0 for non-existent guild');
        } else {
            console.log('❌ FAIL: Should return 0 for non-existent guild');
        }
        
        // Test 2: setQuota and getQuota for existing guild
        console.log('\n📋 Test 2: setQuota and getQuota for existing guild');
        await database.setQuota('test_guild_123', 15, 'test_user_456');
        const existingQuota = await database.getQuota('test_guild_123');
        console.log(`Result: ${existingQuota}`);
        if (existingQuota === 15) {
            console.log('✅ PASS: Correctly stores and retrieves quota');
        } else {
            console.log('❌ FAIL: Should return 15 for set quota');
        }
        
        // Test 3: Update existing quota
        console.log('\n📋 Test 3: Update existing quota');
        await database.setQuota('test_guild_123', 25, 'test_user_789');
        const updatedQuota = await database.getQuota('test_guild_123');
        console.log(`Result: ${updatedQuota}`);
        if (updatedQuota === 25) {
            console.log('✅ PASS: Correctly updates existing quota');
        } else {
            console.log('❌ FAIL: Should return 25 for updated quota');
        }
        
        // Test 4: Multiple guilds independently
        console.log('\n📋 Test 4: Multiple guilds independently');
        await database.setQuota('guild_1', 10, 'user_1');
        await database.setQuota('guild_2', 20, 'user_2');
        const quota1 = await database.getQuota('guild_1');
        const quota2 = await database.getQuota('guild_2');
        console.log(`Guild 1: ${quota1}, Guild 2: ${quota2}`);
        if (quota1 === 10 && quota2 === 20) {
            console.log('✅ PASS: Handles multiple guilds independently');
        } else {
            console.log('❌ FAIL: Should handle multiple guilds independently');
        }
        
        // Test 5: Zero quota (disabled)
        console.log('\n📋 Test 5: Zero quota (disabled)');
        await database.setQuota('disabled_guild', 0, 'moderator');
        const disabledQuota = await database.getQuota('disabled_guild');
        console.log(`Result: ${disabledQuota}`);
        if (disabledQuota === 0) {
            console.log('✅ PASS: Handles zero quota correctly');
        } else {
            console.log('❌ FAIL: Should handle zero quota');
        }
        
        // Test 6: Verify updatedBy field is stored
        console.log('\n📋 Test 6: Verify updatedBy field is stored');
        await database.setQuota('tracked_guild', 15, 'specific_moderator_456');
        const result = await new Promise((resolve, reject) => {
            database.db.get(
                'SELECT updated_by FROM quotas WHERE guild_id = ?',
                ['tracked_guild'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        console.log(`UpdatedBy: ${result.updated_by}`);
        if (result.updated_by === 'specific_moderator_456') {
            console.log('✅ PASS: Stores updatedBy information correctly');
        } else {
            console.log('❌ FAIL: Should store updatedBy information');
        }
        
        // Test 7: Database not initialized error handling
        console.log('\n📋 Test 7: Database not initialized error handling');
        const originalDb = database.db;
        database.db = null;
        
        try {
            await database.getQuota('test_guild');
            console.log('❌ FAIL: Should have thrown an error');
        } catch (error) {
            if (error.message === 'Database not initialized') {
                console.log('✅ PASS: Correctly handles uninitialized database');
            } else {
                console.log('❌ FAIL: Wrong error message');
            }
        } finally {
            database.db = originalDb;
        }
        
        console.log('\n🎉 All quota management tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        // Clean up
        await database.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        console.log('🧹 Test cleanup completed');
    }
}

runQuotaTests();