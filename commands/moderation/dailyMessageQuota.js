const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("messagequota")
        .setDescription("Set daily message quota for users with the 'watchlist' role.")
        .addIntegerOption((option) => 
            option
                .setName("quota")
                .setDescription("Maximum messages per day ('0' to disable quota).")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(1000)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        const limit = interaction.options.getInteger("quota");
        const guildId = interaction.guild.id;
        const moderatorId = interaction.user.id;

        try {
            const oldQuota = await database.getQuota(guildId);
            await database.setQuota(guildId, interaction.guild.name, limit, moderatorId, interaction.user.username);
            await database.logQuotaSet(guildId, moderatorId, interaction.user.username, oldQuota, limit);

            try {
                await database.incrementCommandUsage('dailyMessageQuota');
            } catch (error) {
                console.error('Error tracking command usage:', error);
            }

            if (limit === 0) {
                await interaction.reply({
                    content: "Daily message quota for users with watchlist role has been **disabled.** May your deity of choice save you from the incoming spam tsunami!",
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: `Daily message quota for users with watchlist role has been set to **${limit} ${limit === 1 ? "message" : "messages"}** per day (UTC). No more unlimited spam!`,
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            console.error('Error setting quota:', error);
            
            await interaction.reply({
                content: `There was an error setting the quota. Please try again later.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}