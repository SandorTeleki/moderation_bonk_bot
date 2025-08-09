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

  try {
    await database.initializeDatabase();
    console.log("Database initialized successfully! 🥳");

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
    await member.timeout(timeoutDuration, reason);
    return true;
  } catch (error) {
    console.error(`Failed to timeout user ${member.user.username}:`, error);
    return false;
  }
}

async function createWatchlistRoles(client) {
  const guilds = client.guilds.cache;
  console.log(`Checking watchlist roles in ${guilds.size} guilds...`);

  for (const [guildId, guild] of guilds) {
    try {
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
          `Created watchlist role in guild: ${guild.name} (${guildId})`
        );

        try {
          await database.logAction(
            guildId,
            "watchlist_role_created",
            null,
            null,
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

client.on(Events.GuildCreate, async (guild) => {
  try {
    const existingRole = guild.roles.cache.find(
      (role) => role.name.toLowerCase() === "watchlist"
    );

    if (!existingRole) {
      const watchlistRole = await guild.roles.create({
        name: "watchlist",
        color: "#FF6B6B",
        reason: "Automatic watchlist role creation for quota system.",
      });

      try {
        await database.logAction(
          guild.id,
          "watchlist_role_created",
          null,
          null,
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

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`Received ${signal} but shutdown already in progress...`);
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    if (database && database.db) {
      await database.close();
      console.log("Database connection closed");
    }

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

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

client.login(token);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const dailyLimit = await database.executeWithRetry(async () => {
      return await database.getQuota(message.guild.id);
    });

    if (!dailyLimit || dailyLimit === 0) return;

    const member = message.member;
    if (!member) return;

    const hasWatchlistRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "watchlist"
    );
    if (!hasWatchlistRole) return;

    const today = getTodayUTC();
    const newCount = await database.executeWithRetry(async () => {
      return await database.incrementMessageCount(
        message.guild.id,
        message.author.id,
        today
      );
    });

    // Debug logging for quota issues - focus on the core problem
    console.log(`[QUOTA] Guild: ${message.guild.name} (${message.guild.id})`);
    console.log(`[QUOTA] User: ${message.author.username} (${message.author.id})`);
    console.log(`[QUOTA] Date: ${today}`);
    console.log(`[QUOTA] Count: ${newCount}/${dailyLimit}`);
    console.log(`[QUOTA] Will timeout: ${newCount > dailyLimit}`);

    if (newCount > dailyLimit) {
      if (member.moderatable && !member.isCommunicationDisabled()) {
        const success = await timeoutUser(
          member,
          `Exceeded daily message quota (${dailyLimit} messages)`
        );

        if (success) {
          try {
            await database.executeWithRetry(async () => {
              return await database.logAutoTimeout(
                message.guild.id,
                message.author.id,
                message.author.username,
                newCount,
                dailyLimit
              );
            });
          } catch (error) {
            console.error("Failed to log auto timeout after retries:", error);
          }

          try {
            const now = new Date();
            const nextDay = new Date(now);
            nextDay.setUTCDate(now.getUTCDate() + 1);
            nextDay.setUTCHours(0, 0, 0, 0);
            const midnightUTCTimestamp = Math.floor(nextDay.getTime() / 1000);

            await message.channel.send({
              content: `⚠️ ${message.author.username} has exceeded their daily message quota (${dailyLimit} messages) and has been timed out until <t:${midnightUTCTimestamp}:F> (midnight UTC). Bonk!`,
            });
          } catch (error) {
            console.error("Failed to send quota exceeded notification:", error);
          }
        } else {
          try {
            await database.executeWithRetry(async () => {
              return await database.logAction(
                message.guild.id,
                "timeout_failed",
                null,
                null,
                message.author.id,
                message.author.username,
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

    try {
      await database.executeWithRetry(async () => {
        return await database.logAction(
          message.guild?.id || "unknown",
          "message_tracking_error",
          null,
          null,
          message.author?.id || "unknown",
          message.author?.username || "unknown",
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
