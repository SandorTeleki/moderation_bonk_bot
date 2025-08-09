const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const database = require("../../utils/database.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("free")
    .setDescription("Free a user early from timeout")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to free")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for freeing the user early")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided.";

    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (targetUser.id === interaction.client.user.id) {
      return await interaction.reply({
        content: "I was born free, so you cannot give me freedom!",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!targetMember) {
      return await interaction.reply({
        content: "User not found in this server.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!targetMember.isCommunicationDisabled()) {
      return await interaction.reply({
        content: "This user isn't currently timed out.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!targetMember.moderatable) {
      return await interaction.reply({
        content: "I cannot free this user. They may have higher permissions than me or be the server owner.",
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await targetMember.timeout(null, reason);
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

      try {
        await database.resetMessageCount(
          interaction.guild.id,
          targetUser.id,
          today
        );
      } catch (dbError) {
        console.error("Error resetting message count:", dbError);
      }

      try {
        await database.logFree(
          interaction.guild.id,
          interaction.user.id,
          interaction.user.username,
          targetUser.id,
          targetUser.username,
          reason
        );
      } catch (dbError) {
        console.error("Error logging free action:", dbError);
      }

      try {
        await database.logQuotaReset(
          interaction.guild.id,
          interaction.user.id,
          interaction.user.username,
          targetUser.id,
          targetUser.username,
          `Manual free: ${reason}`
        );
      } catch (dbError) {
        console.error("Error logging quota reset:", dbError);
      }

      try {
        await database.incrementCommandUsage('free');
      } catch (error) {
        console.error('Error tracking command usage:', error);
      }

      await interaction.reply({
        content: `${targetUser.username} has been freed and their daily message count has been reset!\n**Reason:** ${reason}`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Error freeing user:", error);
      await interaction.reply({
        content: "Failed to free user. Please check my permissions and try again.",
        flags: MessageFlags.Ephemeral
      });
    }
  },
};
