# Moderation Bonk Bot: Keeping Servers Clean One Bonk at a Time

A small bot to help deal with spam on your servers. Set a daily message quota, apply a watchlist role to users who like to spam, and watch the bot automatically time them out when they go over the daily message quota.

-----

## Plans:
- No plans at the moment

## Currently working on:
- (loading...)

## Potential future plans:
- Depends on how the bot is used and what the userbase would like.

-----

## Hosting own version of the bot:
- Create a discord bot through the [Discord Developer Portal](https://discord.com/developers/docs/intro)
- Remember to grab the bot token.
- Clone the github repoistory of the Moderation_Bonk_bot and save it locally.
- Create an config.json file to hold the "clientID", "guildID" and "token" for the bot if you plan to host it on a single server. 
- If you plan to have your version of the bot on multiple servers, you won't need a guildID in your config.json file.
- If you plan to publish your version of the bot to github, remember to include your token containing file in the .gitignore list.
- Run `npm install` to install dependencies.
- Push your slash commands with `node deploy-commands.js` to the servers.
- Spin up the bot instance with `node index.js` (or `node .`)

-----

## Bot comamnds
- Note: you can always use the `help` slash command in Discord to see the slash commands that the bot has.

### /messagequota {required: quota}
Set message quota from 0 to 1000 messages per day. 0 means no quota. Can only be used by a user with Admin permission.

### /free {required: user_name} {optional: reason}
Free a user from timeout. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.

### /timeout {required: user_name} {optional: reason}
Timeout a user. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.

### /unwatchlist {required: user_name} {optional: reason}
Remove "watchlist" role from the user. Also clears their daily message count. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.

### /watchlist {required: user_name} {optional: reason}
Add "watchlist" role to the user, so their message count is tracked against the daily quota. Requires username of targeted user. Reason is optional. Can be used by users with "mute" permission.