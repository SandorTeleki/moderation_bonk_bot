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
            reject(err);
            return;
          }
          console.log("Connected to SQLite database");
          this.createTables()
            .then(() => resolve())
            .catch(reject);
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
                updated_by TEXT
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
                target_user_id TEXT,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
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
        resolve(row ? row.daily_limit : 0);
      });
    });
  }

  /**
   * Set quota for a guild
   * @param {string} guildId - Discord guild ID
   * @param {number} limit - Daily message limit
   * @param {string} updatedBy - User ID who updated the quota
   * @returns {Promise<void>}
   */
  async setQuota(guildId, limit, updatedBy) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT OR REPLACE INTO quotas (guild_id, daily_limit, updated_by, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `;

      this.db.run(query, [guildId, limit, updatedBy], function (err) {
        if (err) {
          console.error("Error setting quota:", err.message);
          reject(err);
          return;
        }
        resolve();
      });
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

        // Get the updated count
        const getQuery =
          "SELECT message_count FROM daily_messages WHERE guild_id = ? AND user_id = ? AND date = ?";
        db.get(getQuery, [guildId, userId, date], (err, row) => {
          if (err) {
            console.error("Error getting updated count:", err.message);
            reject(err);
            return;
          }
          resolve(row ? row.message_count : 1);
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
   * @param {string|null} targetUserId - User ID of target user
   * @param {Object} details - Additional details as object (will be JSON stringified)
   * @returns {Promise<void>}
   */
  async logAction(guildId, actionType, moderatorId, targetUserId, details) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query = `
                INSERT INTO logs (guild_id, action_type, moderator_id, target_user_id, details, timestamp)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

      const detailsJson = details ? JSON.stringify(details) : null;

      this.db.run(
        query,
        [guildId, actionType, moderatorId, targetUserId, detailsJson],
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
   * @param {number} oldQuota - Previous quota limit
   * @param {number} newQuota - New quota limit
   * @returns {Promise<void>}
   */
  async logQuotaSet(guildId, moderatorId, oldQuota, newQuota) {
    const details = {
      oldQuota,
      newQuota,
    };
    return this.logAction(guildId, "quota_set", moderatorId, null, details);
  }

  /**
   * Log manual timeout action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator
   * @param {string} targetUserId - User ID of target user
   * @param {string} reason - Reason for timeout
   * @param {number} duration - Timeout duration in milliseconds
   * @returns {Promise<void>}
   */
  async logTimeout(guildId, moderatorId, targetUserId, reason, duration) {
    const details = {
      reason,
      duration,
    };
    return this.logAction(
      guildId,
      "timeout",
      moderatorId,
      targetUserId,
      details
    );
  }

  /**
   * Log manual free action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator
   * @param {string} targetUserId - User ID of target user
   * @param {string} reason - Reason for freeing user
   * @returns {Promise<void>}
   */
  async logFree(guildId, moderatorId, targetUserId, reason) {
    const details = {
      reason,
    };
    return this.logAction(guildId, "free", moderatorId, targetUserId, details);
  }

  /**
   * Log automatic timeout action for quota violation
   * @param {string} guildId - Discord guild ID
   * @param {string} targetUserId - User ID of target user
   * @param {number} messageCount - Current message count
   * @param {number} quotaLimit - Quota limit that was exceeded
   * @returns {Promise<void>}
   */
  async logAutoTimeout(guildId, targetUserId, messageCount, quotaLimit) {
    const details = {
      messageCount,
      quotaLimit,
    };
    return this.logAction(guildId, "auto_timeout", null, targetUserId, details);
  }

  /**
   * Log quota reset action
   * @param {string} guildId - Discord guild ID
   * @param {string} moderatorId - User ID of moderator (null for automatic)
   * @param {string} targetUserId - User ID of target user
   * @param {string} reason - Reason for quota reset
   * @returns {Promise<void>}
   */
  async logQuotaReset(guildId, moderatorId, targetUserId, reason) {
    const details = {
      reason,
    };
    return this.logAction(
      guildId,
      "quota_reset",
      moderatorId,
      targetUserId,
      details
    );
  }

  /**
   * Clean up old daily message records (older than specified days)
   * @param {number} daysToKeep - Number of days to keep (default: 7)
   * @returns {Promise<number>} - Number of records deleted
   */
  async cleanupOldMessages(daysToKeep = 7) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffDateStr = cutoffDate.toISOString().split("T")[0]; // YYYY-MM-DD format

      const query = "DELETE FROM daily_messages WHERE date < ?";
      this.db.run(query, [cutoffDateStr], function (err) {
        if (err) {
          console.error("Error cleaning up old messages:", err.message);
          reject(err);
          return;
        }
        console.log(`Cleaned up ${this.changes} old daily message records`);
        resolve(this.changes);
      });
    });
  }

  /**
   * Clean up old log entries (older than specified days)
   * @param {number} daysToKeep - Number of days to keep (default: 30)
   * @returns {Promise<number>} - Number of records deleted
   */
  async cleanupOldLogs(daysToKeep = 30) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const query =
        'DELETE FROM logs WHERE timestamp < datetime("now", "-" || ? || " days")';
      this.db.run(query, [daysToKeep], function (err) {
        if (err) {
          console.error("Error cleaning up old logs:", err.message);
          reject(err);
          return;
        }
        console.log(`Cleaned up ${this.changes} old log entries`);
        resolve(this.changes);
      });
    });
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
        rows.forEach(row => {
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
      
      // Get count of quotas
      this.db.get("SELECT COUNT(*) as count FROM quotas", [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        stats.quotaCount = row.count;
        
        // Get count of daily messages
        this.db.get("SELECT COUNT(*) as count FROM daily_messages", [], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          stats.messageRecordCount = row.count;
          
          // Get count of logs
          this.db.get("SELECT COUNT(*) as count FROM logs", [], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            stats.logCount = row.count;
            
            // Get oldest message record date
            this.db.get("SELECT MIN(date) as oldest_date FROM daily_messages", [], (err, row) => {
              if (err) {
                reject(err);
                return;
              }
              stats.oldestMessageDate = row.oldest_date;
              
              // Get oldest log timestamp
              this.db.get("SELECT MIN(timestamp) as oldest_timestamp FROM logs", [], (err, row) => {
                if (err) {
                  reject(err);
                  return;
                }
                stats.oldestLogTimestamp = row.oldest_timestamp;
                resolve(stats);
              });
            });
          });
        });
      });
    });
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
        console.log("Database connection closed");
        this.db = null;
        resolve();
      });
    });
  }
}

// Create and export a singleton instance
const database = new Database();

module.exports = database;
