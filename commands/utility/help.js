const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

const { getHelpEmbed } = require('../../utils/helpEmbed');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Gives information about the bot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),
		
	async execute(interaction) {
		await interaction.reply({ embeds: [getHelpEmbed()] });
	},
};
