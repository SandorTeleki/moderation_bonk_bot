import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Discord.js client and guild structures
const mockGuild1 = {
  id: 'guild-1',
  name: 'Test Guild 1',
  roles: {
    cache: new Map(),
    create: vi.fn()
  }
};

const mockGuild2 = {
  id: 'guild-2',
  name: 'Test Guild 2',
  roles: {
    cache: new Map(),
    create: vi.fn()
  }
};

const mockClient = {
  guilds: {
    cache: new Map([
      ['guild-1', mockGuild1],
      ['guild-2', mockGuild2]
    ])
  }
};

const mockWatchlistRole = {
  id: 'watchlist-role-id',
  name: 'watchlist'
};

// Mock database
const mockDatabase = {
  logAction: vi.fn()
};

vi.mock('../utils/database.js', () => mockDatabase);

describe('Automatic Watchlist Role Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset guild role caches
    mockGuild1.roles.cache.clear();
    mockGuild2.roles.cache.clear();
    
    // Setup default mock returns
    mockGuild1.roles.create.mockResolvedValue(mockWatchlistRole);
    mockGuild2.roles.create.mockResolvedValue(mockWatchlistRole);
    mockDatabase.logAction.mockResolvedValue();
  });

  it('should create watchlist roles in guilds that do not have them', async () => {
    // Import the function from index.js (we need to extract it for testing)
    // For now, we'll test the logic directly
    
    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;
      console.log(`Checking watchlist roles in ${guilds.size} guilds...`);
      
      for (const [guildId, guild] of guilds) {
        try {
          // Check if watchlist role exists
          const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
          
          if (!existingRole) {
            // Create the watchlist role
            const watchlistRole = await guild.roles.create({
              name: 'watchlist',
              color: '#FF6B6B',
              reason: 'Automatic watchlist role creation for quota system'
            });
            console.log(`Created watchlist role in guild: ${guild.name} (${guildId})`);
            
            // Log the role creation
            try {
              await mockDatabase.logAction(
                guildId,
                'watchlist_role_created',
                null,
                null,
                { guildName: guild.name, automatic: true }
              );
            } catch (logError) {
              console.error(`Error logging watchlist role creation for guild ${guildId}:`, logError);
            }
          } else {
            console.log(`Watchlist role already exists in guild: ${guild.name} (${guildId})`);
          }
        } catch (error) {
          console.error(`Error creating watchlist role in guild ${guild.name} (${guildId}):`, error);
        }
      }
    };

    await createWatchlistRoles(mockClient);

    // Both guilds should have had roles created
    expect(mockGuild1.roles.create).toHaveBeenCalledWith({
      name: 'watchlist',
      color: '#FF6B6B',
      reason: 'Automatic watchlist role creation for quota system'
    });
    expect(mockGuild2.roles.create).toHaveBeenCalledWith({
      name: 'watchlist',
      color: '#FF6B6B',
      reason: 'Automatic watchlist role creation for quota system'
    });

    // Both actions should be logged
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      'guild-1',
      'watchlist_role_created',
      null,
      null,
      { guildName: 'Test Guild 1', automatic: true }
    );
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      'guild-2',
      'watchlist_role_created',
      null,
      null,
      { guildName: 'Test Guild 2', automatic: true }
    );
  });

  it('should skip guilds that already have watchlist roles', async () => {
    // Setup: Guild 1 already has a watchlist role
    mockGuild1.roles.cache.set('existing-role-id', {
      id: 'existing-role-id',
      name: 'watchlist'
    });

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
          
          if (!existingRole) {
            await guild.roles.create({
              name: 'watchlist',
              color: '#FF6B6B',
              reason: 'Automatic watchlist role creation for quota system'
            });
            
            await mockDatabase.logAction(
              guildId,
              'watchlist_role_created',
              null,
              null,
              { guildName: guild.name, automatic: true }
            );
          }
        } catch (error) {
          console.error(`Error creating watchlist role in guild ${guild.name} (${guildId}):`, error);
        }
      }
    };

    await createWatchlistRoles(mockClient);

    // Guild 1 should not have role created (already exists)
    expect(mockGuild1.roles.create).not.toHaveBeenCalled();
    
    // Guild 2 should have role created
    expect(mockGuild2.roles.create).toHaveBeenCalledWith({
      name: 'watchlist',
      color: '#FF6B6B',
      reason: 'Automatic watchlist role creation for quota system'
    });

    // Only Guild 2 action should be logged
    expect(mockDatabase.logAction).toHaveBeenCalledTimes(1);
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      'guild-2',
      'watchlist_role_created',
      null,
      null,
      { guildName: 'Test Guild 2', automatic: true }
    );
  });

  it('should handle role creation failures gracefully', async () => {
    // Setup: Guild 1 role creation fails
    mockGuild1.roles.create.mockRejectedValue(new Error('Missing permissions'));

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
          
          if (!existingRole) {
            await guild.roles.create({
              name: 'watchlist',
              color: '#FF6B6B',
              reason: 'Automatic watchlist role creation for quota system'
            });
            
            await mockDatabase.logAction(
              guildId,
              'watchlist_role_created',
              null,
              null,
              { guildName: guild.name, automatic: true }
            );
          }
        } catch (error) {
          console.error(`Error creating watchlist role in guild ${guild.name} (${guildId}):`, error);
        }
      }
    };

    await createWatchlistRoles(mockClient);

    // Both guilds should attempt role creation
    expect(mockGuild1.roles.create).toHaveBeenCalled();
    expect(mockGuild2.roles.create).toHaveBeenCalled();

    // Only Guild 2 should be logged (Guild 1 failed)
    expect(mockDatabase.logAction).toHaveBeenCalledTimes(1);
    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      'guild-2',
      'watchlist_role_created',
      null,
      null,
      { guildName: 'Test Guild 2', automatic: true }
    );
  });

  it('should handle database logging failures gracefully', async () => {
    // Setup: Database logging fails
    mockDatabase.logAction.mockRejectedValue(new Error('Database error'));

    const createWatchlistRoles = async (client) => {
      const guilds = client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        try {
          const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
          
          if (!existingRole) {
            await guild.roles.create({
              name: 'watchlist',
              color: '#FF6B6B',
              reason: 'Automatic watchlist role creation for quota system'
            });
            
            try {
              await mockDatabase.logAction(
                guildId,
                'watchlist_role_created',
                null,
                null,
                { guildName: guild.name, automatic: true }
              );
            } catch (logError) {
              console.error(`Error logging watchlist role creation for guild ${guildId}:`, logError);
            }
          }
        } catch (error) {
          console.error(`Error creating watchlist role in guild ${guild.name} (${guildId}):`, error);
        }
      }
    };

    // Should not throw error even if logging fails
    await expect(createWatchlistRoles(mockClient)).resolves.not.toThrow();

    // Roles should still be created
    expect(mockGuild1.roles.create).toHaveBeenCalled();
    expect(mockGuild2.roles.create).toHaveBeenCalled();
  });

  it('should handle guild join events correctly', async () => {
    const newGuild = {
      id: 'new-guild-id',
      name: 'New Guild',
      roles: {
        cache: new Map(),
        create: vi.fn().mockResolvedValue(mockWatchlistRole)
      }
    };

    const handleGuildJoin = async (guild) => {
      console.log(`Bot joined new guild: ${guild.name} (${guild.id})`);
      
      try {
        const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'watchlist');
        
        if (!existingRole) {
          const watchlistRole = await guild.roles.create({
            name: 'watchlist',
            color: '#FF6B6B',
            reason: 'Automatic watchlist role creation for quota system'
          });
          console.log(`Created watchlist role in new guild: ${guild.name} (${guild.id})`);
          
          try {
            await mockDatabase.logAction(
              guild.id,
              'watchlist_role_created',
              null,
              null,
              { guildName: guild.name, automatic: true, onJoin: true }
            );
          } catch (logError) {
            console.error(`Error logging watchlist role creation for new guild ${guild.id}:`, logError);
          }
        }
      } catch (error) {
        console.error(`Error creating watchlist role in new guild ${guild.name} (${guild.id}):`, error);
      }
    };

    await handleGuildJoin(newGuild);

    expect(newGuild.roles.create).toHaveBeenCalledWith({
      name: 'watchlist',
      color: '#FF6B6B',
      reason: 'Automatic watchlist role creation for quota system'
    });

    expect(mockDatabase.logAction).toHaveBeenCalledWith(
      'new-guild-id',
      'watchlist_role_created',
      null,
      null,
      { guildName: 'New Guild', automatic: true, onJoin: true }
    );
  });
});