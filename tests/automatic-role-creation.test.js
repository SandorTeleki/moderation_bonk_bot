import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class MockCollection extends Map {
  find(callback) {
    for (const [key, value] of this) {
      if (callback(value, key, this)) {
        return value;
      }
    }
    return undefined;
  }
}

const mockGuild1 = {
  id: "guild-1",
  name: "Test Guild 1",
  roles: {
    cache: new MockCollection(),
    create: vi.fn(),
  },
};

const mockGuild2 = {
  id: "guild-2",
  name: "Test Guild 2",
  roles: {
    cache: new MockCollection(),
    create: vi.fn(),
  },
};

const mockClient = {
  guilds: {
    cache: new Map([
      ["guild-1", mockGuild1],
      ["guild-2", mockGuild2],
    ]),
  },
};

const mockWatchlistRole = {
  id: "watchlist-role-id",
  name: "watchlist",
};

const mockDatabase = {
  logAction: vi.fn(),
};

vi.mock("../utils/database.js", () => mockDatabase);

describe("Automatic Watchlist Role Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGuild1.roles.cache.clear();
    mockGuild2.roles.cache.clear();

    mockGuild1.roles.create.mockResolvedValue(mockWatchlistRole);
    mockGuild2.roles.create.mockResolvedValue(mockWatchlistRole);
    mockDatabase.logAction.mockResolvedValue();
  });

  it("should create watchlist roles in guilds that do not have them", async () => {
    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(
            (role) => role.name.toLowerCase() === "watchlist"
          );

          if (!existingRole) {
            const watchlistRole = await guild.roles.create({
              name: "watchlist",
              color: "#FF6B6B",
              reason: "Automatic watchlist role creation for quota system",
            });

            try {
              await mockDatabase.logAction(
                guildId,
                "watchlist_role_created",
                null,
                null,
                null,
                null,
                { guildName: guild.name, automatic: true }
              );
            } catch (logError) {
              console.error(
                `Error logging watchlist role creation for guild ${guildId}:`,
                logError
              );
            }
          } else {
            return;
          }
        } catch (error) {
          console.error(
            `Error creating watchlist role in guild ${guild.name} (${guildId}):`,
            error
          );
        }
      }
    };

    await createWatchlistRoles(mockClient);

    expect(mockGuild1.roles.create).toHaveBeenCalledWith({
      name: "watchlist",
      color: "#FF6B6B",
      reason: "Automatic watchlist role creation for quota system",
    });
    expect(mockGuild2.roles.create).toHaveBeenCalledWith({
      name: "watchlist",
      color: "#FF6B6B",
      reason: "Automatic watchlist role creation for quota system",
    });

    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      "guild-1",
      "watchlist_role_created",
      null,
      null,
      null,
      null,
      { guildName: "Test Guild 1", automatic: true }
    );
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      "guild-2",
      "watchlist_role_created",
      null,
      null,
      null,
      null,
      { guildName: "Test Guild 2", automatic: true }
    );
  });

  it("should skip guilds that already have watchlist roles", async () => {
    mockGuild1.roles.cache.set("existing-role-id", {
      id: "existing-role-id",
      name: "watchlist",
    });

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(
            (role) => role.name.toLowerCase() === "watchlist"
          );

          if (!existingRole) {
            await guild.roles.create({
              name: "watchlist",
              color: "#FF6B6B",
              reason: "Automatic watchlist role creation for quota system",
            });

            await mockDatabase.logAction(
              guildId,
              "watchlist_role_created",
              null,
              null,
              { guildName: guild.name, automatic: true }
            );
          }
        } catch (error) {
          console.error(
            `Error creating watchlist role in guild ${guild.name} (${guildId}):`,
            error
          );
        }
      }
    };

    await createWatchlistRoles(mockClient);

    expect(mockGuild1.roles.create).not.toHaveBeenCalled();
    expect(mockGuild2.roles.create).toHaveBeenCalledWith({
      name: "watchlist",
      color: "#FF6B6B",
      reason: "Automatic watchlist role creation for quota system",
    });

    expect(mockDatabase.logAction).toHaveBeenCalledTimes(1);
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      "guild-2",
      "watchlist_role_created",
      null,
      null,
      { guildName: "Test Guild 2", automatic: true }
    );
  });

  it("should handle role creation failures gracefully", async () => {
    mockGuild1.roles.create.mockRejectedValue(new Error("Missing permissions"));

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(
            (role) => role.name.toLowerCase() === "watchlist"
          );

          if (!existingRole) {
            await guild.roles.create({
              name: "watchlist",
              color: "#FF6B6B",
              reason: "Automatic watchlist role creation for quota system",
            });

            await mockDatabase.logAction(
              guildId,
              "watchlist_role_created",
              null,
              null,
              { guildName: guild.name, automatic: true }
            );
          }
        } catch (error) {
          console.error(
            `Error creating watchlist role in guild ${guild.name} (${guildId}):`,
            error
          );
        }
      }
    };

    await createWatchlistRoles(mockClient);

    expect(mockGuild1.roles.create).toHaveBeenCalled();
    expect(mockGuild2.roles.create).toHaveBeenCalled();

    expect(mockDatabase.logAction).toHaveBeenCalledTimes(1);
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      "guild-2",
      "watchlist_role_created",
      null,
      null,
      { guildName: "Test Guild 2", automatic: true }
    );
  });

  it("should handle database logging failures gracefully", async () => {
    mockDatabase.logAction.mockRejectedValue(new Error("Database error"));

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(
            (role) => role.name.toLowerCase() === "watchlist"
          );

          if (!existingRole) {
            await guild.roles.create({
              name: "watchlist",
              color: "#FF6B6B",
              reason: "Automatic watchlist role creation for quota system",
            });

            try {
              await mockDatabase.logAction(
                guildId,
                "watchlist_role_created",
                null,
                null,
                { guildName: guild.name, automatic: true }
              );
            } catch (logError) {
              console.error(
                `Error logging watchlist role creation for guild ${guildId}:`,
                logError
              );
            }
          }
        } catch (error) {
          console.error(
            `Error creating watchlist role in guild ${guild.name} (${guildId}):`,
            error
          );
        }
      }
    };

    await expect(createWatchlistRoles(mockClient)).resolves.not.toThrow();

    expect(mockGuild1.roles.create).toHaveBeenCalled();
    expect(mockGuild2.roles.create).toHaveBeenCalled();
  });

  it("should handle guild join events correctly", async () => {
    const newGuild = {
      id: "new-guild-id",
      name: "New Guild",
      roles: {
        cache: new MockCollection(),
        create: vi.fn().mockResolvedValue(mockWatchlistRole),
      },
    };

    const handleGuildJoin = async (guild) => {
      try {
        const existingRole = guild.roles.cache.find(
          (role) => role.name.toLowerCase() === "watchlist"
        );

        if (!existingRole) {
          const watchlistRole = await guild.roles.create({
            name: "watchlist",
            color: "#FF6B6B",
            reason: "Automatic watchlist role creation for quota system",
          });

          try {
            await mockDatabase.logAction(
              guild.id,
              "watchlist_role_created",
              null,
              null,
              { guildName: guild.name, automatic: true, onJoin: true }
            );
          } catch (logError) {
            console.error(
              `Error logging watchlist role creation for new guild ${guild.id}:`,
              logError
            );
          }
        }
      } catch (error) {
        console.error(
          `Error creating watchlist role in new guild ${guild.name} (${guild.id}):`,
          error
        );
      }
    };

    await handleGuildJoin(newGuild);

    expect(newGuild.roles.create).toHaveBeenCalledWith({
      name: "watchlist",
      color: "#FF6B6B",
      reason: "Automatic watchlist role creation for quota system",
    });

    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      "new-guild-id",
      "watchlist_role_created",
      null,
      null,
      { guildName: "New Guild", automatic: true, onJoin: true }
    );
  });
});
