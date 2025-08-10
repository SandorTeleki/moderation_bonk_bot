const { EmbedBuilder } = require('discord.js');

function getHelpEmbed(){
	return new EmbedBuilder()
		.setTitle('Dom_Inspector_Bot help')
		.setDescription('The Dom_Inspector_Bot provides you info on items, spells, units, sites and mercenaries.')
		.addFields(
			{ name : '```/messagequota {required: quota} ```', value: 'Set message quota from 0 to 1000 messages per day, providing a value is required. 0 means no quota. Can only be used by a user with Admin permission.'},
			{ name : '```/free {required: user_name} {optional: reason}```', value: 'Free a user from timeout. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.'},
			{ name : '```/timeout {required: user_name} {optional: reason}```', value: 'Timeout a user. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.'},
			{ name : '```/unwatchlist {required: user_name} {optional: reason}```', value: 'Remove "watchlist" role from the user. Also clears their daily message count. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.'},
			{ name : '```/watchlist {required: user_name} {optional: reason}```', value: 'Add "watchlist" role to the user, so their message count is tracked against the daily quota. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.'},
			{ name : 'Feedback', value: 'Feedback, suggestions, and bug reports are welcome on [GitHub](https://github.com/SandorTeleki/moderation_bonk_bot), through DMs or through Discord pings.'},
			{ name : 'About', value: '[Moderation Bonk bot](https://github.com/SandorTeleki/moderation_bonk_bot) was created by Toldi.'},
		)
}

module.exports = { getHelpEmbed }
