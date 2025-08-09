const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, "..", "bot_data.db");
  }

  /**
   * Initialize database connection and create tables if they don't exist
   * @returns {Promise<void>}
   */
  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      try {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error("Error opening database:", err.message);

            // Attempt to recover from database corruption
            if (
              err.message.includes("database disk image is malformed") ||
              err.message.includes("file is not a database") ||
              err.code === "SQLITE_NOTADB"
            ) {
              this.recoverCorruptedDatabase()
                .then(() => {
                  this.db = new sqlite3.Database(this.dbPath, (retryErr) => {
                    if (retryErr) {
                      console.error(
                        "Failed to recover database:",
                        retryErr.message
                      );
                      reject(retryErr);
                      return;
                    }
                    this.createTables()
                      .then(() => resolve())
                      .catch(reject);
                  });
                })
                .catch((recoveryErr) => {
                  console.error("Database recovery failed:", recoveryErr);
                  reject(recoveryErr);
                });
              return;
            }

            reject(err);
            return;
          }
          this.createTables()
            .then(() => resolve())
            .catch((createErr) => {
              if (
                createErr.message.includes("file is not a database") ||
                createErr.code === "SQLITE_NOTADB"
              ) {
                this.recoverCorruptedDatabase()
                  .then(() => {
                    this.db = new sqlite3.Database(this.dbPath, (retryErr) => {
                      if (retryErr) {
                        console.error(
                          "Failed to recover database:",
                          retryErr.message
                        );
                        reject(retryErr);
                        return;
                      }
                      this.createTables()
                        .then(() => resolve())
                        .catch(reject);
                    });
                  })
                  .catch((recoveryErr) => {
                    console.error("Database recovery failed:", recoveryErr);
                    reject(recoveryErr);
                  });
              } else {
                reject(createErr);
              }
            });
        });
      } catch (error) {
        console.error("Database initialization error:", error);
        reject(error);
      }
    });
  }

  /**
   * Create all required tables if they don't exist
   * @returns {Promise<void>}
   */
  async createTables() {
    const quotasTable = `
            CREATE TABLE IF NOT EXISTS quotas (
                guild_id TEXT PRIMARY KEY,
                daily_limit INTEGER NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT,
                updated_by_username TEXT
            )
        `;

    const dailyMessagesTable = `
            CREATE TABLE IF NOT EXISTS daily_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                message_count INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, user_id, date)
            )
        `;

    const logsTable = `
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                moderator_id TEXT,
                moderator_username TEXT,
                target_user_id TEXT,
                target_username TEXT,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

    const commandUsageTable = `
            CREATE TABLE IF NOT EXISTS command_usage (
                command_name TEXT PRIMARY KEY,
                usage_count INTEGER NOT NULL DEFAULT 0
            )
        `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(quotasTable, (err) => {
          if (err) {
            console.error("Error creating quotas table:", err.message);
            reject(err);
            return;
          }
        });

        this.db.run(dailyMessagesTable, (err) => {
          if (err) {
            console.error("Error creating daily_messages table:", err.message);
            reject(err);
            return;
          }
        });

        this.db.run(logsTable, (err) => {
          if (err) {
            console.error("Error creating logs table:", err.message);
            reject(err);
            return;
          }
        });

        this.db.run(commandUsageTable, (err) => {
          if (err) {
            console.error("Error creating command_usage table:", err.message);
            reject(err);
            return;
          }
          console.log("All database tables created successfully!");
          resolve();
        });
      });
    });
  }

  /**
   * Get quota setting for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<number>} - Daily message limit (0 if not set)
   */
  async getQuota(guildId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = "SELECT daily_limit FROM quotas WHERE guild_id = ?";
      this.db.get(query, [guildId], (err, row) => {
        if (err) {
          console.error("Error getting quota:", err.message);
          reject(err);
          return;
        }
        const quota = row ? row.daily_limit : 0;
        console.log(`[DB] getQuota for guild ${guildId}: ${quota}`);
        resolve(quota);
      });
    });
  }

  /**
   * Set quota for a guild
   * @param {string} guildId - Discord guild ID
   * @param {number} limit - Daily message limit
   * @param {string} updatedBy - User ID who updated the quota
   * @param {string} updatedByUsername - Username who updated the quota
   * @returns {Promise<void>}
   */
  async setQuota(guildId, limit, updatedBy, updatedByUsername) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT OR REPLACE INTO quotas (guild_id, daily_limit, updated_by, updated_by_username, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

      this.db.run(
        query,
        [guildId, limit, updatedBy, updatedByUsername],
        function (err) {
          if (err) {
            console.error("Error setting quota:", err.message);
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }

  /**
   * Increment message count for a user on a specific date
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<number>} - New message count
   */
  async incrementMessageCount(guildId, userId, date) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT INTO daily_messages (guild_id, user_id, date, message_count, last_updated)
                VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(guild_id, user_id, date) 
                DO UPDATE SET 
                    message_count = message_count + 1,
                    last_updated = CURRENT_TIMESTAMP
            `;

      const db = this.db; // Store reference to avoid context issues
      db.run(query, [guildId, userId, date], function (err) {
        if (err) {
          console.error("Error incrementing message count:", err.message);
          reject(err);
          return;
        }

        const getQuery =
          "SELECT message_count FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?";
        db.get(getQuery, [guildId, userId, date], (err, row) => {
          if (err) {
            console.error("Error getting updated count:", err.message);
            reject(err);
            return;
          }
          const count = row ? row.message_count : 1;
          console.log(
            `[DB] incrementMessageCount for guild ${guildId}, user ${userId}, date ${date}: ${count}`
          );
          resolve(count);
        });
      });
    });
  }

  /**
   * Get message count for a user on a specific date
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<number>} - Current message count
   */
  async getMessageCount(guildId, userId, date) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query =
        "SELECT message_count FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?";
      this.db.get(query, [guildId, userId, date], (err, row) => {
        if (err) {
          console.error("Error getting message count:", err.message);
          reject(err);
          return;
        }
        resolve(row ? row.message_count : 0);
      });
    });
  }

  /**
   * Reset message count for a user on a specific date
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<void>}
   */
  async resetMessageCount(guildId, userId, date) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT OR REPLACE INTO daily_messages (guild_id, user_id, date, message_count, last_updated)
                VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
            `;

      this.db.run(query, [guildId, userId, date], function (err) {
        if (err) {
          console.error("Error resetting message count:", err.message);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Log an action to the audit trail
   * @param {string} guildId - Discord guild ID
   * @param {string} actionType - Type of action (quota_set, timeout, untimeout, auto_timeout, quota_reset)
   * @param {string|null} moderatorId - User ID of moderator (null for automatic actions)
   * @param {string|null} moderatorUsername - Username of moderator (null for automatic actions)
   * @param {string|null} targetUserId - User ID of target user
   * @param {string|null} targetUsername - Username of target user
   * @param {Object} details - Additional details as object (will be JSON stringified)
   * @returns {Promise<void>}
   */
  async logAction(
    guildId,
    actionType,
    moderatorId,
    moderatorUsername,
    targetUserId,
    targetUsername,
    details
  ) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT INTO logs (guild_id, action_type, moderator_id, moderator_username, target_user_id, target_username, details, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

      const detailsJson = details ? JSON.stringify(details) : null;

      this.db.run(
        query,
        [
          guildId,
          actionType,
          moderatorId,
          moderatorUsername,
          targetUserId,
          targetUsername,
          detailsJson,
        ],
        function (err) {
          if (err) {
            console.error("Error logging action:", err.message);
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }

  /**
   * Log quota setting action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator
   * @param {string} moderatorUsername - Username of moderator
   * @param {number} oldQuota - Previous quota limit
   * @param {number} newQuota - New quota limit
   * @returns {Promise<void>}
   */
  async logQuotaSet(
    guildId,
    moderatorId,
    moderatorUsername,
    oldQuota,
    newQuota
  ) {
    const details = {
      oldQuota,
      newQuota,
    };
    return this.logAction(
      guildId,
      "quota_set",
      moderatorId,
      moderatorUsername,
      null,
      null,
      details
    );
  }

  /**
   * Log manual timeout action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator
   * @param {string} moderatorUsername - Username of moderator
   * @param {string} targetUserId - User ID of target user
   * @param {string} targetUsername - Username of target user
   * @param {string} reason - Reason for timeout
   * @param {number} duration - Timeout duration in milliseconds
   * @returns {Promise<void>}
   */
  async logTimeout(
    guildId,
    moderatorId,
    moderatorUsername,
    targetUserId,
    targetUsername,
    reason,
    duration
  ) {
    const details = {
      reason,
      duration,
    };
    return this.logAction(
      guildId,
      "timeout",
      moderatorId,
      moderatorUsername,
      targetUserId,
      targetUsername,
      details
    );
  }

  /**
   * Log manual free action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator
   * @param {string} moderatorUsername - Username of moderator
   * @param {string} targetUserId - User ID of target user
   * @param {string} targetUsername - Username of target user
   * @param {string} reason - Reason for freeing user
   * @returns {Promise<void>}
   */
  async logFree(
    guildId,
    moderatorId,
    moderatorUsername,
    targetUserId,
    targetUsername,
    reason
  ) {
    const details = {
      reason,
    };
    return this.logAction(
      guildId,
      "free",
      moderatorId,
      moderatorUsername,
      targetUserId,
      targetUsername,
      details
    );
  }

  /**
   * Log automatic timeout action for quota violation
   * @param {string} guildId - Discord guild ID
   * @param {string} targetUserId - User ID of target user
   * @param {string} targetUsername - Username of target user
   * @param {number} messageCount - Current message count
   * @param {number} quotaLimit - Quota limit that was exceeded
   * @returns {Promise<void>}
   */
  async logAutoTimeout(
    guildId,
    targetUserId,
    targetUsername,
    messageCount,
    quotaLimit
  ) {
    const details = {
      messageCount,
      quotaLimit,
    };
    return this.logAction(
      guildId,
      "auto_timeout",
      null,
      null,
      targetUserId,
      targetUsername,
      details
    );
  }

  /**
   * Log quota reset action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator (null for automatic)
   * @param {string} moderatorUsername - Username of moderator (null for automatic)
   * @param {string} targetUserId - User ID of target user
   * @param {string} targetUsername - Username of target user
   * @param {string} reason - Reason for quota reset
   * @returns {Promise<void>}
   */
  async logQuotaReset(
    guildId,
    moderatorId,
    moderatorUsername,
    targetUserId,
    targetUsername,
    reason
  ) {
    const details = {
      reason,
    };
    return this.logAction(
      guildId,
      "quota_reset",
      moderatorId,
      moderatorUsername,
      targetUserId,
      targetUsername,
      details
    );
  }

  /**
   * Load all quota settings from database
   * @returns {Promise<Map<string, number>>} - Map of guild IDs to quota limits
   */
  async loadAllQuotas() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = "SELECT guild_id, daily_limit FROM quotas";
      this.db.all(query, [], (err, rows) => {
        if (err) {
          console.error("Error loading all quotas:", err.message);
          reject(err);
          return;
        }

        const quotaMap = new Map();
        rows.forEach((row) => {
          quotaMap.set(row.guild_id, row.daily_limit);
        });

        console.log(`Loaded ${quotaMap.size} quota settings from database`);
        resolve(quotaMap);
      });
    });
  }

  /**
   * Get database statistics for maintenance purposes
   * @returns {Promise<Object>} - Object containing database statistics
   */
  async getDatabaseStats() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const stats = {};

      this.db.get("SELECT COUNT(*) as count FROM quotas", [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        stats.quotaCount = row.count;

        this.db.get(
          "SELECT COUNT(*) as count FROM daily_messages",
          [],
          (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            stats.messageRecordCount = row.count;

            this.db.get(
              "SELECT COUNT(*) as count FROM logs",
              [],
              (err, row) => {
                if (err) {
                  reject(err);
                  return;
                }
                stats.logCount = row.count;

                this.db.get(
                  "SELECT MIN(date) as oldest_date FROM daily_messages",
                  [],
                  (err, row) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    stats.oldestMessageDate = row.oldest_date;

                    this.db.get(
                      "SELECT MIN(timestamp) as oldest_timestamp FROM logs",
                      [],
                      (err, row) => {
                        if (err) {
                          reject(err);
                          return;
                        }
                        stats.oldestLogTimestamp = row.oldest_timestamp;
                        resolve(stats);
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  /**
   * Increment command usage count
   * @param {string} commandName - Name of the command that was used
   * @returns {Promise<number>} - New usage count for the command
   */
  async incrementCommandUsage(commandName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT INTO command_usage (command_name, usage_count)
                VALUES (?, 1)
                ON CONFLICT(command_name) 
                DO UPDATE SET usage_count = usage_count + 1
            `;

      const db = this.db; // Store reference to avoid context issues
      db.run(query, [commandName], function (err) {
        if (err) {
          console.error("Error incrementing command usage:", err.message);
          reject(err);
          return;
        }

        const getQuery =
          "SELECT usage_count FROM command_usage WHERE command_name = ?";
        db.get(getQuery, [commandName], (err, row) => {
          if (err) {
            console.error(
              "Error getting updated command usage count:",
              err.message
            );
            reject(err);
            return;
          }
          resolve(row ? row.usage_count : 1);
        });
      });
    });
  }

  /**
   * Recover from corrupted database by recreating it
   * @returns {Promise<void>}
   */
  async recoverCorruptedDatabase() {
    const fs = require("fs");
    const backupPath = this.dbPath + ".backup." + Date.now();

    return new Promise((resolve, reject) => {
      try {
        if (fs.existsSync(this.dbPath)) {
          fs.copyFileSync(this.dbPath, backupPath);
          console.log(`Corrupted database backed up to: ${backupPath}`);

          fs.unlinkSync(this.dbPath);
          console.log("Corrupted database file removed");
        }

        this.cleanupOldBackups();

        resolve();
      } catch (error) {
        console.error("Error during database recovery:", error);
        reject(error);
      }
    });
  }

  /**
   * Clean up old backup files, keeping only the most recent ones
   * @param {number} keepCount - Number of backup files to keep (default: 5)
   */
  cleanupOldBackups(keepCount = 5) {
    try {
      const fs = require("fs");
      const path = require("path");

      const dbDir = path.dirname(this.dbPath);
      const dbName = path.basename(this.dbPath);

      const files = fs.readdirSync(dbDir);
      const backupFiles = files
        .filter((file) => file.startsWith(dbName + ".backup."))
        .map((file) => ({
          name: file,
          path: path.join(dbDir, file),
          timestamp: parseInt(file.split(".backup.")[1]) || 0,
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first

      if (backupFiles.length > keepCount) {
        const filesToDelete = backupFiles.slice(keepCount);
        filesToDelete.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
            console.log(`Cleaned up old backup file: ${file.name}`);
          } catch (error) {
            console.error(
              `Failed to delete backup file ${file.name}:`,
              error.message
            );
          }
        });
      }
    } catch (error) {
      console.error("Error cleaning up old backup files:", error);
    }
  }

  /**
   * Check database integrity
   * @returns {Promise<boolean>} - True if database is healthy
   */
  async checkIntegrity() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      this.db.get("PRAGMA integrity_check", [], (err, row) => {
        if (err) {
          console.error("Database integrity check failed:", err.message);
          resolve(false);
          return;
        }

        const isHealthy = row && row.integrity_check === "ok";
        if (!isHealthy) {
          console.warn("Database integrity check failed:", row);
        }
        resolve(isHealthy);
      });
    });
  }

  /**
   * Execute database operation with retry logic
   * @param {Function} operation - Database operation to execute
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @returns {Promise<any>} - Result of the operation
   */
  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `Database operation failed (attempt ${attempt}/${maxRetries}):`,
          error.message
        );

        if (
          error.message.includes("database is locked") &&
          attempt < maxRetries
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
          continue;
        }

        if (attempt === maxRetries || !this.isRetryableError(error)) {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} - True if the error is retryable
   */
  isRetryableError(error) {
    const retryableMessages = [
      "database is locked",
      "database disk image is malformed",
      "SQLITE_BUSY",
      "SQLITE_LOCKED",
    ];

    return retryableMessages.some((msg) => error.message.includes(msg));
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          console.error("Error closing database:", err.message);
          reject(err);
          return;
        }
        this.db = null;
        resolve();
      });
    });
  }
}

const database = new Database();
module.exports = database;
