const fs = require("node:fs");
const path = require("node:path");
const {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} = require("discord.js");
const { token } = require("./config.json");
const database = require("./utils/database.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Message tracking and quota systems are now handled by database

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log("");
  console.log("==================================================");
  console.log(`=====Ready! Logged in as ${readyClient.user.tag}=====`);
  console.log("==================================================");
  console.log("");

  // Initialize database
  try {
    await database.initializeDatabase();
    console.log("Database initialized successfully! 🥳");

    // Load quota settings from database on startup
    try {
      const quotaMap = await database.loadAllQuotas();
      console.log(
        `Loaded quota settings for ${quotaMap.size} guilds from database`
      );
    } catch (error) {
      console.error("Error loading quota settings on startup:", error);
    }

    // Create watchlist roles in all guilds on startup
    try {
      await createWatchlistRoles(readyClient);
    } catch (error) {
      console.error("Error creating watchlist roles on startup:", error);
    }

    // Set up periodic database integrity check (run every 24 hours)
    setInterval(async () => {
      try {
        console.log("Running periodic database integrity check...");

        // Check database integrity periodically
        const isHealthy = await database.checkIntegrity();
        if (!isHealthy) {
          console.warn("Database integrity check failed");
        } else {
          console.log("Database integrity check passed");
        }
      } catch (error) {
        console.error("Error during periodic database check:", error);

        // Log the error for audit purposes
        try {
          await database.logAction(
            "system",
            "integrity_check_error",
            null,
            null,
            { error: error.message, timestamp: new Date().toISOString() }
          );
        } catch (logError) {
          console.error("Failed to log integrity check error:", logError);
        }
      }
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

    // Run initial database integrity check on startup
    try {
      console.log("Running initial database integrity check...");
      const isHealthy = await database.checkIntegrity();
      if (isHealthy) {
        console.log("Initial database integrity check passed");
      } else {
        console.warn("Initial database integrity check failed");
      }
    } catch (error) {
      console.error("Error during initial database integrity check:", error);
    }
  } catch (error) {
    console.error("Failed to initialize database 😭:", error);
    console.log("Bot cannot function without database - shutting down");
    process.exit(1);
  }
});

//Set Bot activity
client.on("ready", () => {
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "😎 Waiting to bonk!",
        type: ActivityType.Custom,
        state: "😎 Waiting to bonk!",
      },
    ],
  });
});

// Helper functions for message quota system
function getTodayUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function calculateTimeoutUntilMidnightUTC() {
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setUTCDate(now.getUTCDate() + 1);
  nextDay.setUTCHours(0, 0, 0, 0);
  return nextDay.getTime() - now.getTime();
}

async function timeoutUser(member, reason) {
  try {
    const timeoutDuration = calculateTimeoutUntilMidnightUTC();

    // Discord timeout limit is 28 days
    if (timeoutDuration > 2419200000) {
      console.log(
        `Timeout duration exceeds Discord limit for user ${member.user.username}`
      );
      return false;
    }

    await member.timeout(timeoutDuration, reason);
    console.log(
      `User ${member.user.username} timed out for exceeding daily message quota`
    );
    return true;
  } catch (error) {
    console.error(`Failed to timeout user ${member.user.username}:`, error);
    return false;
  }
}

// Helper function to create watchlist roles
async function createWatchlistRoles(client) {
  const guilds = client.guilds.cache;
  console.log(`Checking watchlist roles in ${guilds.size} guilds...`);

  for (const [guildId, guild] of guilds) {
    try {
      // Check if watchlist role exists
      const existingRole = guild.roles.cache.find(
        (role) => role.name.toLowerCase() === "watchlist"
      );

      if (!existingRole) {
        // Create the watchlist role
        const watchlistRole = await guild.roles.create({
          name: "watchlist",
          color: "#FF6B6B",
          reason: "Automatic watchlist role creation for quota system",
        });
        console.log(
          `Created watchlist role in guild: ${guild.name} (${guildId})`
        );

        // Log the role creation
        try {
          await database.logAction(
            guildId,
            "watchlist_role_created",
            null,
            null,
            { guildName: guild.name, automatic: true }
          );
        } catch (logError) {
          console.error(
            `Error logging watchlist role creation for guild ${guildId}:`,
            logError
          );
        }
      } else {
        console.log(
          `Watchlist role already exists in guild: ${guild.name} (${guildId})`
        );
      }
    } catch (error) {
      console.error(
        `Error creating watchlist role in guild ${guild.name} (${guildId}):`,
        error
      );
    }
  }
}

// Handle bot joining new guilds
client.on(Events.GuildCreate, async (guild) => {
  console.log(`Bot joined new guild: ${guild.name} (${guild.id})`);

  try {
    // Create watchlist role in the new guild
    const existingRole = guild.roles.cache.find(
      (role) => role.name.toLowerCase() === "watchlist"
    );

    if (!existingRole) {
      const watchlistRole = await guild.roles.create({
        name: "watchlist",
        color: "#FF6B6B",
        reason: "Automatic watchlist role creation for quota system",
      });
      console.log(
        `Created watchlist role in new guild: ${guild.name} (${guild.id})`
      );

      // Log the role creation
      try {
        await database.logAction(
          guild.id,
          "watchlist_role_created",
          null,
          null,
          { guildName: guild.name, automatic: true, onJoin: true }
        );
      } catch (logError) {
        console.error(
          `Error logging watchlist role creation for new guild ${guild.id}:`,
          logError
        );
      }
    }
  } catch (error) {
    console.error(
      `Error creating watchlist role in new guild ${guild.name} (${guild.id}):`,
      error
    );
  }
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`Received ${signal} but shutdown already in progress...`);
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    // Close database connection
    if (database && database.db) {
      await database.close();
      console.log("Database connection closed");
    }

    // Destroy Discord client
    if (client) {
      client.destroy();
      console.log("Discord client disconnected");
    }
  } catch (error) {
    console.error("Error during shutdown:", error);
  }

  console.log("Shutdown complete");
  process.exit(0);
}

// Handle both SIGINT (Ctrl+C) and SIGTERM (process termination)
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

client.login(token);

// Message tracking and quota enforcement
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages and DMs
  if (message.author.bot || !message.guild) return;

  try {
    // Check if quota system is enabled for this guild
    const dailyLimit = await database.executeWithRetry(async () => {
      return await database.getQuota(message.guild.id);
    });

    if (!dailyLimit || dailyLimit === 0) return;

    // Check if user has the "watchlist" role
    const member = message.member;
    if (!member) return;

    const hasWatchlistRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "watchlist"
    );
    if (!hasWatchlistRole) return;

    // Track the message using database with retry logic
    const today = getTodayUTC();
    const newCount = await database.executeWithRetry(async () => {
      return await database.incrementMessageCount(
        message.guild.id,
        message.author.id,
        today
      );
    });

    // Check if user has reached their quota limit (timeout immediately)
    if (newCount > dailyLimit) {
      // Only timeout if they can be moderated and aren't already timed out
      if (member.moderatable && !member.isCommunicationDisabled()) {
        const success = await timeoutUser(
          member,
          `Exceeded daily message quota (${dailyLimit} messages)`
        );

        if (success) {
          // Log the automatic timeout with retry
          try {
            await database.executeWithRetry(async () => {
              return await database.logAutoTimeout(
                message.guild.id,
                message.author.id,
                newCount,
                dailyLimit
              );
            });
          } catch (error) {
            console.error("Failed to log auto timeout after retries:", error);
          }

          // Send a notification to the channel with Discord timestamp
          try {
            // Calculate midnight UTC timestamp for Discord formatting
            const now = new Date();
            const nextDay = new Date(now);
            nextDay.setUTCDate(now.getUTCDate() + 1);
            nextDay.setUTCHours(0, 0, 0, 0);
            const midnightUTCTimestamp = Math.floor(nextDay.getTime() / 1000);

            await message.channel.send({
              content: `⚠️ ${message.author.username} has exceeded their daily message quota (${dailyLimit} messages) and has been timed out until <t:${midnightUTCTimestamp}:F> (midnight UTC).`,
            });
          } catch (error) {
            console.error("Failed to send quota exceeded notification:", error);
          }
        } else {
          // Log failed timeout attempt
          try {
            await database.executeWithRetry(async () => {
              return await database.logAction(
                message.guild.id,
                "timeout_failed",
                null,
                message.author.id,
                {
                  reason: "Quota exceeded but timeout failed",
                  messageCount: newCount,
                  quotaLimit: dailyLimit,
                  moderatable: member.moderatable,
                  alreadyTimedOut: member.isCommunicationDisabled(),
                }
              );
            });
          } catch (logError) {
            console.error("Failed to log timeout failure:", logError);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in message tracking:", error);

    // Log the error for debugging
    try {
      await database.executeWithRetry(async () => {
        return await database.logAction(
          message.guild?.id || "unknown",
          "message_tracking_error",
          null,
          message.author?.id || "unknown",
          {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          }
        );
      });
    } catch (logError) {
      console.error("Failed to log message tracking error:", logError);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
