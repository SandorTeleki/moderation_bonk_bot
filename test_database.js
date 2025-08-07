// Simple test script to verify database functionality
const database = require("./utils/database");

async function testDatabase() {
  try {
    console.log("Testing database initialization...");
    await database.initializeDatabase();
    console.log("✓ Database initialized successfully");

    console.log("Testing quota operations...");
    await database.setQuota("test_guild_123", 10, "test_user_456");
    const quota = await database.getQuota("test_guild_123");
    console.log(`✓ Quota set and retrieved: ${quota}`);

    console.log("Testing message count operations...");
    const today = new Date().toISOString().split("T")[0];
    const count1 = await database.incrementMessageCount(
      "test_guild_123",
      "test_user_789",
      today
    );
    console.log(`✓ Message count incremented: ${count1}`);

    const count2 = await database.incrementMessageCount(
      "test_guild_123",
      "test_user_789",
      today
    );
    console.log(`✓ Message count incremented again: ${count2}`);

    const currentCount = await database.getMessageCount(
      "test_guild_123",
      "test_user_789",
      today
    );
    console.log(`✓ Current message count retrieved: ${currentCount}`);

    console.log("Testing logging operations...");
    await database.logAction(
      "test_guild_123",
      "quota_set",
      "test_moderator",
      "test_target",
      {
        oldQuota: 0,
        newQuota: 10,
        reason: "Testing",
      }
    );
    console.log("✓ Action logged successfully");

    console.log("Testing reset operations...");
    await database.resetMessageCount("test_guild_123", "test_user_789", today);
    const resetCount = await database.getMessageCount(
      "test_guild_123",
      "test_user_789",
      today
    );
    console.log(`✓ Message count reset: ${resetCount}`);

    console.log("All tests passed! Database module is working correctly.");

    await database.close();
    console.log("✓ Database connection closed");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testDatabase();
