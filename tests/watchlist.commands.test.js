import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Discord.js
const mockInteraction = {
  guild: {
    id: 'test-guild-id',
    members: {
      fetch: vi.fn()
    },
    roles: {
      cache: new Map(),
      create: vi.fn()
    }
  },
  user: {
    id: 'moderator-id',
    username: 'TestModerator'
  },
  options: {
    getUser: vi.fn(),
    getString: vi.fn()
  },
  reply: vi.fn()
};

const mockTargetUser = {
  id: 'target-user-id',
  username: 'TestUser'
};

const mockTargetMember = {
  id: 'target-user-id',
  roles: {
    cache: new Map(),
    add: vi.fn(),
    remove: vi.fn()
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

vi.mock('../../utils/database.js', () => mockDatabase);

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName() { return this; }
    setDescription() { return this; }
    addUserOption() { return this; }
    addStringOption() { return this; }
    setDefaultMemberPermissions() { return this; }
  },
  PermissionsBitField: {
    Flags: {
      ManageGuild: 'MANAGE_GUILD'
    }
  },
  MessageFlags: {
    Ephemeral: 64
  }
}));

describe('Watchlist Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock interaction state
    mockInteraction.guild.roles.cache.clear();
    mockTargetMember.roles.cache.clear();
    
    // Setup default mock returns
    mockInteraction.options.getUser.mockReturnValue(mockTargetUser);
    mockInteraction.options.getString.mockReturnValue('Test reason');
    mockInteraction.guild.members.fetch.mockResolvedValue(mockTargetMember);
    mockDatabase.logAction.mockResolvedValue();
  });

  describe('Watchlist Command', () => {
    let watchlistCommand;

    beforeEach(() => {
      // Import the command fresh for each test
      delete require.cache[require.resolve('../../commands/moderation/watchlist.js')];
      watchlistCommand = require('../../commands/moderation/watchlist.js');
    });

    it('should successfully add user to watchlist when role exists', async () => {
      // Setup: Role exists, user doesn't have it
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockTargetMember.roles.add).toHaveBeenCalledWith(
        mockWatchlistRole,
        'Watchlist added by TestModerator: Test reason'
      );
      expect(mockDatabase.logAction).toHaveBeenCalledWith(
        'test-guild-id',
        'watchlist_add',
        'moderator-id',
        'target-user-id',
        { reason: 'Test reason', username: 'TestUser' }
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ TestUser has been added to the watchlist.\n**Reason:** Test reason',
        flags: 64
      });
    });

    it('should create watchlist role if it does not exist', async () => {
      // Setup: No watchlist role exists
      const createdRole = { id: 'new-role-id', name: 'watchlist' };
      mockInteraction.guild.roles.create.mockResolvedValue(createdRole);
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockInteraction.guild.roles.create).toHaveBeenCalledWith({
        name: 'watchlist',
        color: '#FF6B6B',
        reason: 'Automatic watchlist role creation for quota system'
      });
      expect(mockTargetMember.roles.add).toHaveBeenCalledWith(
        createdRole,
        'Watchlist added by TestModerator: Test reason'
      );
    });

    it('should handle user already having watchlist role', async () => {
      // Setup: User already has the role
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockTargetMember.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockTargetMember.roles.add).not.toHaveBeenCalled();
      expect(mockDatabase.logAction).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '⚠️ TestUser is already on the watchlist.',
        flags: 64
      });
    });

    it('should handle user not being a member of the server', async () => {
      mockInteraction.guild.members.fetch.mockResolvedValue(null);
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ User TestUser is not a member of this server.',
        flags: 64
      });
    });

    it('should handle role creation failure', async () => {
      // Setup: Role creation fails
      mockInteraction.guild.roles.create.mockRejectedValue(new Error('Permission denied'));
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Failed to create watchlist role. Please ensure the bot has the "Manage Roles" permission.',
        flags: 64
      });
    });

    it('should handle database logging failure gracefully', async () => {
      // Setup: Database logging fails
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockDatabase.logAction.mockRejectedValue(new Error('Database error'));
      
      await watchlistCommand.execute(mockInteraction);

      // Should still add the role and reply, even if logging fails
      expect(mockTargetMember.roles.add).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ There was an error adding TestUser to the watchlist. Please try again later.',
        flags: 64
      });
    });

    it('should use default reason when none provided', async () => {
      mockInteraction.options.getString.mockReturnValue(null);
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await watchlistCommand.execute(mockInteraction);

      expect(mockDatabase.logAction).toHaveBeenCalledWith(
        'test-guild-id',
        'watchlist_add',
        'moderator-id',
        'target-user-id',
        { reason: 'No reason provided', username: 'TestUser' }
      );
    });
  });

  describe('Unwatchlist Command', () => {
    let unwatchlistCommand;

    beforeEach(() => {
      // Import the command fresh for each test
      delete require.cache[require.resolve('../../commands/moderation/unwatchlist.js')];
      unwatchlistCommand = require('../../commands/moderation/unwatchlist.js');
    });

    it('should successfully remove user from watchlist', async () => {
      // Setup: Role exists, user has it
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockTargetMember.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockTargetMember.roles.remove).toHaveBeenCalledWith(
        mockWatchlistRole,
        'Watchlist removed by TestModerator: Test reason'
      );
      expect(mockDatabase.logAction).toHaveBeenCalledWith(
        'test-guild-id',
        'watchlist_remove',
        'moderator-id',
        'target-user-id',
        { reason: 'Test reason', username: 'TestUser' }
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ TestUser has been removed from the watchlist.\n**Reason:** Test reason',
        flags: 64
      });
    });

    it('should handle user not being a member of the server', async () => {
      mockInteraction.guild.members.fetch.mockResolvedValue(null);
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ User TestUser is not a member of this server.',
        flags: 64
      });
    });

    it('should handle watchlist role not existing', async () => {
      // Setup: No watchlist role exists
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ No watchlist role found in this server.',
        flags: 64
      });
    });

    it('should handle user not having watchlist role', async () => {
      // Setup: Role exists but user doesn't have it
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockTargetMember.roles.remove).not.toHaveBeenCalled();
      expect(mockDatabase.logAction).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '⚠️ TestUser is not on the watchlist.',
        flags: 64
      });
    });

    it('should handle role removal failure', async () => {
      // Setup: Role removal fails
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockTargetMember.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockTargetMember.roles.remove.mockRejectedValue(new Error('Permission denied'));
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ There was an error removing TestUser from the watchlist. Please try again later.',
        flags: 64
      });
    });

    it('should use default reason when none provided', async () => {
      mockInteraction.options.getString.mockReturnValue(null);
      mockInteraction.guild.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      mockTargetMember.roles.cache.set('watchlist-role-id', mockWatchlistRole);
      
      await unwatchlistCommand.execute(mockInteraction);

      expect(mockDatabase.logAction).toHaveBeenCalledWith(
        'test-guild-id',
        'watchlist_remove',
        'moderator-id',
        'target-user-id',
        { reason: 'No reason provided', username: 'TestUser' }
      );
    });
  });
});