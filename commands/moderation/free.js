const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('free')
        .setDescription('Free a user early from timeout')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to free')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason for freeing the user early')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (targetUser.id === interaction.client.user.id){
            return await interaction.reply({
                content: "I was born free, so you cannot give me freedom!"
            });
        }

        if (!targetMember) {
            return await interaction.reply({
                content: "User not found in this server.",
                flags: MessageFlags.Ephemeral
            })
        }

        if (!targetMember.isCommunicationDisabled()) {
            return await interaction.reply({
                content: "This user isn't currently timed out.",
                flags: MessageFlags.Ephemeral
            })
        }

        if (!targetMember.moderatable) {
            return await interaction.reply({
                content: 'I cannot free this user. They may have higher permissions than me or be the server owner.',
                flags: MessageFlags.Ephemeral
            })
        }

        try {
            await targetMember.timeout(null, reason);
            await interaction.reply({
                content: `${targetUser.username} has been freed!\n**Reason:** ${reason}`,
                flags: MessageFlags.Ephemeral
            })
        } catch (error) {
            console.error('Error freeing user:', error);
            await interaction.reply({
                content: 'Failed to free user. Please check my permissions and try again.',
                flags: MessageFlags.Ephemeral
            })
        }
    }
        
}
