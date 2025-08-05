const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

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

        if(!interaction.client.messageQuotas){
            interaction.client.messageQuotas = new Map();
        }

        interaction.client.messageQuotas.set(interaction.guild.id, limit);

        if (limit === 0) {
            await interaction.reply({
                content: "Daily message quota for users with watchlist role has been **disabled.** May your deity of choice save you from the incoming spam tsunami!",
                flags: MessageFlags.Ephemeral
            })
        } else {
            await interaction.reply({
                content: `Daily message quota for users with watchlist role has been set to **${limit} ${limit === 1 ? "message" : "messages"}** per day (UTC). No more unlimited spam!`,
                flags: MessageFlags.Ephemeral
            })
        }


    }
}