const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("watchlist")
        .setDescription("Add a user to the watchlist role for message quota tracking.")
        .addUserOption((option) => 
            option
                .setName("user")
                .setDescription("The user to add to the watchlist")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Reason for adding user to watchlist")
                .setRequired(false)
                .setMaxLength(500)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const guildId = interaction.guild.id;
        const moderatorId = interaction.user.id;

        try {
            // Get the target member
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            if (targetUser.id === interaction.client.user.id) {
                return await interaction.reply({
                    content: "I am already on all the watchlists, you can't add me to this one!",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!targetMember) {
                await interaction.reply({
                    content: `User ${targetUser.username} is not a member of this server.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Find or create the watchlist role
            let watchlistRole = interaction.guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
            
            if (!watchlistRole) {
                try {
                    watchlistRole = await interaction.guild.roles.create({
                        name: 'watchlist',
                        color: '#FF6B6B',
                        reason: 'Automatic watchlist role creation for quota system'
                    });
                    console.log(`Created watchlist role in guild ${guildId}`);
                } catch (error) {
                    console.error('Error creating watchlist role:', error);
                    await interaction.reply({
                        content: `Failed to create watchlist role. Please ensure the bot has the "Manage Roles" permission.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            // Check if user already has the role
            if (targetMember.roles.cache.has(watchlistRole.id)) {
                await interaction.reply({
                    content: `${targetUser.username} is already on the watchlist.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Add the role to the user
            await targetMember.roles.add(watchlistRole, `Watchlist added by ${interaction.user.username}: ${reason}`);

            // Log the action
            await database.logAction(
                guildId,
                'watchlist_add',
                moderatorId,
                targetUser.id,
                { reason, username: targetUser.username }
            );

            await interaction.reply({
                content: `${targetUser.username} has been added to the watchlist.\n**Reason:** ${reason}`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error adding user to watchlist:', error);
            
            await interaction.reply({
                content: `There was an error adding ${targetUser.username} to the watchlist. Please try again later.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};