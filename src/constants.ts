import { config } from "dotenv";

config();

export default {
  VoiceChannel: process.env.VOICECHANNEL ? process.env.VOICECHANNEL : "",
  LogsChannel: process.env.LOGSCHANNEL ? process.env.LOGSCHANNEL : "",
  IAChannel: process.env.IACHANNEL ? process.env.IACHANNEL : "",
  Guild: process.env.GUILD ? process.env.GUILD : "",
  Token: process.env.TOKEN ? process.env.TOKEN : "",
  ListeningUserId: process.env.LISTENINGUSERID
    ? process.env.LISTENINGUSERID
    : "",
  AIDiscordBotId: process.env.AIDISCORDBOTID ? process.env.AIDISCORDBOTID : "",
  Prefix: process.env.PREFIX ? process.env.PREFIX : "",
  VoiceEmbed:
    "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_jmk_arctic-wav-arctic_a0002.bin",
};
