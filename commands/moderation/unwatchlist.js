const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
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
    .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";
    const guildId = interaction.guild.id;
    const moderatorId = interaction.user.id;

    try {
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      if (targetUser.id === interaction.client.user.id) {
        return await interaction.reply({
          content: "I never was on a watchlist, so you can't remove me!",
          flags: MessageFlags.Ephemeral
        });
      }

      if (!targetMember) {
        return await interaction.reply({
          content: `User ${targetUser.username} is not a member of this server.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const watchlistRole = interaction.guild.roles.cache.find(
        (role) => role.name.toLowerCase() === "watchlist"
      );

      if (!watchlistRole) {
        return await interaction.reply({
          content: `No watchlist role found in this server.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (!targetMember.roles.cache.has(watchlistRole.id)) {
        return await interaction.reply({
          content: `${targetUser.username} is not on the watchlist.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Remove the role from the user
      await targetMember.roles.remove(
        watchlistRole,
        `Watchlist removed by ${interaction.user.username}: ${reason}`
      );

      // Remove timeout if the user is currently timed out
      let timeoutRemoved = false;
      if (targetMember.isCommunicationDisabled()) {
        try {
          await targetMember.timeout(
            null,
            `Timeout removed - unwatchlisted by ${interaction.user.username}: ${reason}`
          );
          timeoutRemoved = true;
        } catch (timeoutError) {
          console.error(
            `Failed to remove timeout for ${targetUser.username}:`,
            timeoutError
          );
        }
      }

      await database.logAction(
        guildId,
        "watchlist_remove",
        moderatorId,
        interaction.user.username,
        targetUser.id,
        targetUser.username,
        { reason, timeoutRemoved }
      );

      try {
        await database.incrementCommandUsage("unwatchlist");
      } catch (error) {
        console.error("Error tracking command usage:", error);
      }

      // Create response message
      let responseMessage = `✅ ${targetUser.username} has been removed from the watchlist.\n**Reason:** ${reason}`;
      if (timeoutRemoved) {
        responseMessage += `\n🔓 **Timeout also removed** - user can now send messages immediately.`;
      }

      await interaction.reply({
        content: responseMessage,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Error removing user from watchlist:", error);

      await interaction.reply({
        content: `There was an error removing ${targetUser.username} from the watchlist. Please try again later.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
