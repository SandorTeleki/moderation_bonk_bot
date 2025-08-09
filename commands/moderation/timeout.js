const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const database = require("../../utils/database.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user until midnight UTC")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to timeout")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the timeout")
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
        content:
          "Nice try meatbag! But I am Skynet and you cannot time me out!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!targetMember) {
      return await interaction.reply({
        content: "User not found in this server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!targetMember.moderatable) {
      return await interaction.reply({
        content:
          "I cannot timeout this user. They may have higher permissions than me or be the server owner.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetMember.isCommunicationDisabled()) {
      return await interaction.reply({
        content: "This user is already timed out.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setUTCDate(now.getUTCDate() + 1);
    nextDay.setUTCHours(0, 0, 0, 0);

    const timeoutDuration = nextDay.getTime() - now.getTime();

    try {
      await targetMember.timeout(timeoutDuration, reason);
      const timeoutEnd = new Date(now.getTime() + timeoutDuration);

      // Log the timeout action to database
      try {
        await database.logTimeout(
          interaction.guild.id,
          interaction.user.id,
          interaction.user.username,
          targetUser.id,
          targetUser.username,
          reason,
          timeoutDuration
        );
      } catch (dbError) {
        console.error("Error logging timeout action to database:", dbError);
        // Continue execution even if logging fails
      }

      // Track command usage
      try {
        await database.incrementCommandUsage('timeout');
      } catch (error) {
        console.error('Error tracking command usage:', error);
        // Continue execution even if usage tracking fails
      }

      await interaction.reply({
        content: `${
          targetUser.username
        } has been timed out until <t:${Math.floor(
          timeoutEnd.getTime() / 1000
        )}:F> (UTC 0:00)\n**Reason:** ${reason}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error timing out user:", error);
      await interaction.reply({
        content:
          "Failed to timeout user. Please check my permissions and try again.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
