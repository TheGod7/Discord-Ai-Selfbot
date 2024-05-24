import { BotAI } from "./client.js";
import express from "express";

const app = express();
async function Start() {
  const client = new BotAI();

  await client.init();

  app.listen(3000, () => {
    console.log("a");
  });

  app.get("/", (req, res) => {
    return res.send("a");
  });
}

Start();
