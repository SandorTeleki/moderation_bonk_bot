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

const client = new Client({intents: [GatewayIntentBits.Guilds]});

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
	console.log("==================================================")
	console.log(`=====Ready! Logged in as ${readyClient.user.tag}=====`);
	console.log("==================================================")
	console.log("");

  // Initialize database
  try {
    await database.initializeDatabase();
    console.log("Database initialized successfully! 🥳");
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

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  try {
    await database.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Error closing database:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  try {
    await database.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Error closing database:", error);
  }
  process.exit(0);
});

client.login(token);

// Message tracking and quota enforcement
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages and DMs
  if (message.author.bot || !message.guild) return;

  try {
    // Check if quota system is enabled for this guild
    const dailyLimit = await database.getQuota(message.guild.id);
    
    if (!dailyLimit || dailyLimit === 0) return;

    // Check if user has the "watchlist" role
    const member = message.member;
    if (!member) return;

    const hasWatchlistRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "watchlist"
    );
    if (!hasWatchlistRole) return;

    // Track the message using database
    const today = getTodayUTC();
    const newCount = await database.incrementMessageCount(
      message.guild.id,
      message.author.id,
      today
    );

    // Check if quota exceeded
    if (newCount > dailyLimit) {
      // Only timeout if they can be moderated and aren't already timed out
      if (member.moderatable && !member.isCommunicationDisabled()) {
        const success = await timeoutUser(
          member,
          `Exceeded daily message quota (${dailyLimit} messages)`
        );

        if (success) {
          // Log the automatic timeout
          try {
            await database.logAutoTimeout(
              message.guild.id,
              message.author.id,
              newCount,
              dailyLimit
            );
          } catch (error) {
            console.error("Failed to log auto timeout:", error);
          }

          // Send a notification to the channel
          try {
            await message.channel.send({
              content: `⚠️ ${message.author.username} has exceeded their daily message quota (${dailyLimit} messages) and has been timed out until midnight UTC.`,
            });
          } catch (error) {
            console.error("Failed to send quota exceeded notification:", error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in message tracking:", error);
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
