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
            // Get the current quota for logging purposes
            const oldQuota = await database.getQuota(guildId);

            // Set the new quota in the database
            await database.setQuota(guildId, limit, moderatorId);

            // Log the quota change
            await database.logQuotaSet(guildId, moderatorId, oldQuota, limit);

            // Update the in-memory cache for backwards compatibility
            if (!interaction.client.messageQuotas) {
                interaction.client.messageQuotas = new Map();
            }
            interaction.client.messageQuotas.set(guildId, limit);

            // Send appropriate response
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
            
            // Fallback to in-memory storage if database fails
            if (!interaction.client.messageQuotas) {
                interaction.client.messageQuotas = new Map();
            }
            interaction.client.messageQuotas.set(guildId, limit);

            await interaction.reply({
                content: `⚠️ Quota has been set to **${limit}** but there was an issue with database storage. The setting may not persist after bot restart.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}