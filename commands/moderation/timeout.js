const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user until midnight UTC')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to timeout')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason for the timeout')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember){
            return await interaction.reply({
                content: "User not found in this server",
                ephemeral: true
            })
        }
        
        if (!targetMember.moderatable) {
            return await interaction.reply({
                content: 'I cannot timeout this user. They may have higher permissions than me or be the server owner.',
                ephemeral: true
            })
        }

        const now = new Date();
        const nextDay = new Date(now);
        nextDay.setUTCDate(now.getUTCDate() + 1);
        nextDay.setUTCHours(0, 0, 0, 0);

        const timeoutDuration = nextDay.getTime() - now.getTime();

        try {
            await targetMember.timeout(timeoutDuration, reason);
            const timeoutEnd = new Date (now.getTime() + timeoutDuration);

            await interaction.reply({
                content: `${targetUser.username} has been timed out until <t:${Math.floor(timeoutEnd.getTime() / 1000)}:F> (UTC 0:00)\n**Reason:** ${reason}`,
                ephemeral: true
            })
        } catch (error) {
            console.error('Error timing out user:', error);
            await interaction.reply({
                content: 'Failed to timeout user. Please check my permissions and try again.',
                ephemeral: true
            })
        }
    }
        
}
