const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

// Bot Configuration
const TARGET_GAMES = ["Minecraft", "Modrinth"]; // Games to track
const DATA_FILE = "./playtime.json";

// Initialize Bot Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences, // Detect user activity
    GatewayIntentBits.GuildMessages, // Process messages
    GatewayIntentBits.MessageContent, // Read message content
  ],
});

// Playtime Data
let playtimeData = {};
if (fs.existsSync(DATA_FILE)) {
  playtimeData = JSON.parse(fs.readFileSync(DATA_FILE));
}

// Save Playtime Data to File
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(playtimeData, null, 2));
}

// Periodically Update Active Players' Playtime
setInterval(() => {
  const now = Date.now();
  let updated = false;

  for (const [userId, data] of Object.entries(playtimeData)) {
    if (data.startTime) {
      const sessionTime = now - data.startTime; // Calculate session duration
      data.playtime += sessionTime; // Add to total playtime
      data.startTime = now; // Reset startTime for the next interval
      updated = true;
    }
  }

  if (updated) {
    console.log("Playtime updated for active players.");
    saveData(); // Save updated data
  }
}, 60000); // Run every 60 seconds

// Event: Bot Ready
client.once("ready", () => {
  console.log(`${client.user.tag} is online and ready!`);
});

// Event: Presence Update (Tracks Users Starting/Stopping Games)
client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.user) return;

  const userId = newPresence.user.id;
  const username = newPresence.user.username;

  // Check if the user is playing a target game
  const gameActivity = newPresence.activities.find((activity) =>
    TARGET_GAMES.some(
      (game) => game.toLowerCase() === activity.name.toLowerCase()
    )
  );

  if (gameActivity) {
    console.log(`${username} is playing ${gameActivity.name}`);
    if (!playtimeData[userId]) {
      playtimeData[userId] = { username, playtime: 0 };
    }
    playtimeData[userId].username = username;
    if (!playtimeData[userId].startTime) {
      playtimeData[userId].startTime = Date.now();
      console.log(`Started tracking playtime for ${username}`);
    }
  } else if (
    oldPresence?.activities.find((activity) =>
      TARGET_GAMES.some(
        (game) => game.toLowerCase() === activity.name.toLowerCase()
      )
    )
  ) {
    // User stopped playing a target game
    if (playtimeData[userId] && playtimeData[userId].startTime) {
      const sessionTime = Date.now() - playtimeData[userId].startTime;
      playtimeData[userId].playtime += sessionTime;
      delete playtimeData[userId].startTime;
      console.log(
        `${username} stopped playing. Session time: ${sessionTime / 1000}s`
      );
    }
  }

  saveData();
});

// Event: Message Create (Commands)
client.on("messageCreate", (message) => {
  if (message.content === "!scoreboard") {
    const sorted = Object.entries(playtimeData)
      .sort(([, a], [, b]) => b.playtime - a.playtime) // Sort by playtime (descending)
      .map(([userId, data], index) => {
        const username = data.username || userId; // Fallback to user ID if username is missing
        const hours = (data.playtime / (1000 * 60 * 60)).toFixed(2); // Convert ms to hours
        return `${index + 1}. ${username}: ${hours} hours`;
      });

    if (sorted.length === 0) {
      message.channel.send("No playtime data recorded yet!");
    } else {
      message.channel.send("**Top crafters:**\n" + sorted.join("\n"));
    }
  }

  // Command: !setplaytime <username> <hours>
  if (message.content.startsWith("!setplaytime")) {
    const args = message.content.split(" ");
    if (args.length !== 3) {
      message.channel.send("Usage: !setplaytime <username> <hours>");
      return;
    }

    const username = args[1];
    const hours = parseFloat(args[2]);

    if (isNaN(hours) || hours < 0) {
      message.channel.send("Please provide a valid number of hours.");
      return;
    }

    // Find user in playtimeData by username
    let userEntry = Object.entries(playtimeData).find(
      ([userId, data]) => data.username === username
    );

    if (!userEntry) {
      // User not found in playtimeData; search the Discord server
      const guild = message.guild; // Current Discord server
      if (!guild) {
        message.channel.send("This command must be used in a server.");
        return;
      }

      const member = guild.members.cache.find(
        (member) => member.user.username === username
      );

      if (!member) {
        message.channel.send(`User ${username} not found in the server.`);
        return;
      }

      // Add user to playtimeData
      const userId = member.user.id;
      playtimeData[userId] = {
        username: member.user.username,
        playtime: hours * 60 * 60 * 1000, // Set playtime in milliseconds
      };
      saveData(); // Save the updated data

      message.channel.send(
        `User ${username} added with ${hours} hours of playtime.`
      );
      return;
    }

    // Update existing user's playtime
    const [userId, userData] = userEntry;
    userData.playtime = hours * 60 * 60 * 1000; // Update playtime in milliseconds
    saveData(); // Save the updated data

    message.channel.send(`Set ${username}'s playtime to ${hours} hours.`);
  }
});

// Login to Discord
require("dotenv").config();
client.login(process.env.DISCORD_BOT_TOKEN);
