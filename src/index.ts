import { BotAI } from "./client.js";

async function Start() {
  const client = new BotAI();

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (!message.content.startsWith(client.prefix)) return;

    const args = message.content.trim().split(/ +/g);
    const command = args[0].split(client.prefix)[1].toLowerCase();

    if (command === "voice") {
      const channel =
        message.mentions.channels.first() || client.channels.cache.get(args[1]);

      if (!channel || channel.type !== "GUILD_VOICE") {
        message.channel.send("Please enter a voice channel");
        return;
      }

      const guild = channel.guild;

      client.VoiceChannel = channel;
      client.Guild = guild;
      client.VoiceConnection.destroy();

      client.currentTime = Date.now();
      await client.ReStartChannels();
      message.channel.send("Ready and connected!");
      return;
    }

    if (command === "user") {
      const user = message.mentions.users.first();

      if (!user) {
        message.channel.send("User not found!");
        return;
      }

      client.ListeningUserId = user;

      await client.ReStartChannels();
      message.channel.send("Now listening to " + user.username);
      return;
    }
  });

  await client.init();
}

Start();
