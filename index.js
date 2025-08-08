const fs = require('node:fs');
const path = require('node:path');
const { ActivityType, Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token } = require('./config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

// Initialize message tracking and quota systems
client.messageQuotas = new Map(); // guildId -> daily limit
client.messageCounts = new Map(); // `${guildId}-${userId}-${dateString}` -> count

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

//Set Bot activity
client.on("ready", () => {
	client.user.setPresence({
        status: 'online',
        activities: [
            {
                name: '😎 Waiting to bonk!',
                type: ActivityType.Custom,
                state: '😎 Waiting to bonk!'
            }
        ]
    });
});

// Helper functions for message quota system
function getTodayUTC() {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function getMessageCountKey(guildId, userId) {
	return `${guildId}-${userId}-${getTodayUTC()}`;
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
			console.log(`Timeout duration exceeds Discord limit for user ${member.user.username}`);
			return false;
		}
		
		await member.timeout(timeoutDuration, reason);
		console.log(`User ${member.user.username} timed out for exceeding daily message quota`);
		return true;
	} catch (error) {
		console.error(`Failed to timeout user ${member.user.username}:`, error);
		return false;
	}
}

client.login(token);




// Message tracking and quota enforcement
client.on(Events.MessageCreate, async message => {
	// Ignore bot messages and DMs
	if (message.author.bot || !message.guild) return;
	
	// Check if quota system is enabled for this guild
	const dailyLimit = client.messageQuotas.get(message.guild.id);
	if (!dailyLimit || dailyLimit === 0) return;
	
	// Check if user has the "watchlist" role
	const member = message.member;
	if (!member) return;
	
	const hasWatchlistRole = member.roles.cache.some(role => role.name.toLowerCase() === 'watchlist');
	if (!hasWatchlistRole) return;
	
	// Track the message
	const countKey = getMessageCountKey(message.guild.id, message.author.id);
	const currentCount = client.messageCounts.get(countKey) || 0;
	const newCount = currentCount + 1;
	client.messageCounts.set(countKey, newCount);
	
	// Check if quota exceeded
	if (newCount > dailyLimit) {
		// Only timeout if they can be moderated and aren't already timed out
		if (member.moderatable && !member.isCommunicationDisabled()) {
			const success = await timeoutUser(member, `Exceeded daily message quota (${dailyLimit} messages)`);
			
			if (success) {
				// Send a notification to the channel
				try {
					await message.channel.send({
						content: `⚠️ ${message.author.username} has exceeded their daily message quota (${dailyLimit} messages) and has been timed out until midnight UTC.`
					});
				} catch (error) {
					console.error('Failed to send quota exceeded notification:', error);
				}
			}
		}
	}
});

client.on(Events.InteractionCreate, async interaction => {
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
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
	}
});