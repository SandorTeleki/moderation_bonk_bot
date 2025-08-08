const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const database = require("../../utils/database.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unwatchlist")
    .setDescription("Remove a user from the watchlist role.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to remove from the watchlist")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for removing user from watchlist")
        .setRequired(false)
        .setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";
    const guildId = interaction.guild.id;
    const moderatorId = interaction.user.id;

    try {
      // Get the target member
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      if (!targetMember) {
        await interaction.reply({
          content: `❌ User ${targetUser.username} is not a member of this server.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Find the watchlist role
      const watchlistRole = interaction.guild.roles.cache.find(
        (role) => role.name.toLowerCase() === "watchlist"
      );

      if (!watchlistRole) {
        await interaction.reply({
          content: `❌ No watchlist role found in this server.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if user has the role
      if (!targetMember.roles.cache.has(watchlistRole.id)) {
        await interaction.reply({
          content: `⚠️ ${targetUser.username} is not on the watchlist.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Remove the role from the user
      await targetMember.roles.remove(
        watchlistRole,
        `Watchlist removed by ${interaction.user.username}: ${reason}`
      );

      // Log the action
      await database.logAction(
        guildId,
        "watchlist_remove",
        moderatorId,
        targetUser.id,
        { reason, username: targetUser.username }
      );

      await interaction.reply({
        content: `✅ ${targetUser.username} has been removed from the watchlist.\n**Reason:** ${reason}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error removing user from watchlist:", error);

      await interaction.reply({
        content: `❌ There was an error removing ${targetUser.username} from the watchlist. Please try again later.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
