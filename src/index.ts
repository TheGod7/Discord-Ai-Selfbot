import { BotAI } from "./client.js";

async function Start() {
  const client = new BotAI();

  await client.init();
}

Start();
