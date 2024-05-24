import CONSTANTS from "./constants.js";

import { v4 } from "uuid";
import prims = require("prism-media");
import ffmpeg from "ffmpeg";
import { createWriteStream } from "node:fs";
import { pipeline as pip } from "node:stream";

import fs from "fs";

import {
  Client,
  ClientOptions,
  Guild,
  Message,
  MessageAttachment,
  StageChannel,
  TextChannel,
  User,
  VoiceChannel,
  WebEmbed,
} from "discord.js-selfbot-v13";

import {
  AutomaticSpeechRecognitionPipeline,
  TextToAudioPipeline,
  pipeline,
} from "@xenova/transformers";

import {
  VoiceConnection,
  joinVoiceChannel,
  createAudioPlayer,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
  EndBehaviorType,
  createAudioResource,
  AudioPlayerStatus,
} from "@discordjs/voice";

import wavFile from "wavefile";

export class BotAI extends Client {
  constructor(options: ClientOptions = {}) {
    super(options);
  }

  synthesizer: TextToAudioPipeline;
  pipe: AutomaticSpeechRecognitionPipeline;
  VoiceConnection: VoiceConnection;

  VoiceChannel: VoiceChannel;
  LogsChannel: TextChannel;
  IAChannel: TextChannel;
  Guild: Guild;

  UserAudioFileName: string | undefined;
  AIAudioFileName: string | undefined;

  ListeningUserId: User;

  Speaking: boolean;
  Listening: boolean;

  currentTime: number;

  async init() {
    this.currentTime = Date.now();
    console.log("Initializing BotAi...");
    console.log("Initializing Speech to Text...");
    this.pipe = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-medium",
      { quantized: true, revision: "no_attentions" }
    );
    console.log("Initializing Text to Speech...");
    this.synthesizer = await pipeline("text-to-speech", "Xenova/mms-tts-spa", {
      quantized: false,
    });

    console.log("initializing Discord Bot ....");

    this.login(CONSTANTS.Token);

    console.log("initializing all of the Channels ....");

    this.on("ready", async (Client) => {
      await this.ReStartChannels();
    });
  }

  async createListeningStream() {
    console.log("creating a audio stream");
    const opusStream = this.VoiceConnection.receiver.subscribe(
      CONSTANTS.ListeningUserId,
      {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 100 },
      }
    );

    const oggStream = new prims.opus.OggLogicalBitstream({
      opusHead: new prims.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
      pageSizeControl: {
        maxPackets: 10,
      },
    });

    const uuid = v4();
    const filename = `./recordings/user/${uuid}`;

    const out = createWriteStream(filename + ".pcm");

    pip(opusStream, oggStream, out, (err) => {
      if (err) {
        console.log("Error in recording the audio stream: " + err.message);
      } else {
        console.log("created the audio stream");
        console.log("converting the audio stream to a wav format");

        const process = new ffmpeg(`${filename}.pcm`);

        process.then(
          (audio) => {
            audio.save(filename + ".wav", (err, file) => {
              console.log("The audio was successfully converted to a wav");
              this.UserAudioFileName = filename + ".wav";

              console.log("Delete the .pcm file");
              fs.unlinkSync(`${filename}.pcm`);
              this.Listening = false;
            });
          },
          (err) => {
            console.log("Error on convert to audio");
            this.Listening = false;
          }
        );
      }
    });
  }

  async SpeechToText(fileName: string): Promise<string | undefined> {
    console.log("Converting the audio file to text");
    let wav = new wavFile.WaveFile(fs.readFileSync(fileName));
    wav.toBitDepth("32f");
    wav.toSampleRate(16000);

    let audioData = wav.getSamples();

    if (Array.isArray(audioData)) {
      if (audioData.length > 1) {
        const SCALING_FACTOR = Math.sqrt(2);

        for (let i = 0; i < audioData[0].length; ++i) {
          audioData[0][i] =
            (SCALING_FACTOR * (audioData[0][i] + audioData[1][i])) / 2;
        }
      }

      audioData = audioData[0];
    }

    const transcribe = await this.pipe(audioData, {
      language: "es",
      task: "transcribe",
    });

    console.log("The audio was transcribed successfully");

    const text = (transcribe as { text: string }).text;

    if (text.includes("[AUDIO_EN_BLANCO]")) return undefined;

    return text;
  }

  async TextToSpeech(text: string) {
    console.log("Converting text to speech");
    const output = await this.synthesizer(text, {
      speaker_embeddings: CONSTANTS.VoiceEmbed,
    });

    const wav = new wavFile.WaveFile();
    wav.fromScratch(1, output.sampling_rate, "32f", output.audio);

    const uuid = v4();

    const filename = `./recordings/ai/${uuid}.wav`;

    fs.writeFileSync(filename, wav.toBuffer());

    this.AIAudioFileName = filename;
    console.log("Converted successfully the text to speech");
  }

  async ReStartChannels() {
    const VoiceChannel = this.channels.cache.get(CONSTANTS.VoiceChannel);
    const LogsChannel = this.channels.cache.get(CONSTANTS.LogsChannel);
    const IAChannel = this.channels.cache.get(CONSTANTS.IAChannel);
    const Guild = this.guilds.cache.get(CONSTANTS.Guild);

    if (
      !VoiceChannel ||
      !LogsChannel ||
      !IAChannel ||
      !Guild ||
      IAChannel.type !== "GUILD_TEXT" ||
      LogsChannel.type !== "GUILD_TEXT" ||
      VoiceChannel.type !== "GUILD_VOICE"
    ) {
      console.log(`Voice Channel Errors: Type: ${VoiceChannel?.type}`);
      console.log(`Logs Channel Errors: Type: ${LogsChannel?.type}`);
      console.log(`IA Channel Errors: Type: ${IAChannel?.type}`);
      console.log(`Guild Errors: Type: ${Guild?.available}`);

      return console.log(
        "The Channels not are valid check if the id are right or the channels are correctly configured"
      );
    }

    this.Guild = Guild;
    this.IAChannel = IAChannel;
    this.LogsChannel = LogsChannel;
    this.VoiceChannel = VoiceChannel;

    console.log("All Channels are initialized");

    console.log("Charging the user to listening...");

    const ListeningUserId = this.users.cache.get(CONSTANTS.ListeningUserId);

    if (!ListeningUserId)
      return console.log("The user not exist or is not available");

    this.ListeningUserId = ListeningUserId;
    console.log("The user is ready");

    console.log("Connecting to the voice Channel");

    this.VoiceConnection = joinVoiceChannel({
      channelId: this.VoiceChannel.id,
      guildId: this.Guild.id,
      selfDeaf: false,
      selfMute: true,
      adapterCreator: this.Guild.voiceAdapterCreator,
    });

    console.log("Creating the player ");

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    await entersState(this.VoiceConnection, VoiceConnectionStatus.Ready, 20e3);

    this.VoiceConnection.subscribe(player);

    console.log("the player and the voice connection are ready");

    const StartTimeTaken = Date.now() - this.currentTime;

    const StartEmbedInformation = new WebEmbed()

      .setDescription(
        SetFormat(Date.now(), "[HH:mm:SS]") +
          " Time taken to start:" +
          StartTimeTaken +
          "ms"
      )
      .setColor("GREEN");

    this.LogsChannel.send({
      content: `${WebEmbed.hiddenEmbed}${StartEmbedInformation}`,
    });

    const receiver = this.VoiceConnection.receiver;

    receiver.speaking.on("start", async (userId) => {
      if (userId !== this.ListeningUserId.id) return;
      if (this.Speaking || this.Listening)
        return console.log(
          "i am speaking or charging the speaker or i am listening"
        );

      this.Listening = true;

      const SpeakerEmbedInformation = new WebEmbed()
        .setDescription(
          SetFormat(Date.now(), "[HH:mm:SS]") + " Listening a  user "
        )
        .setColor("GREEN");

      this.LogsChannel.send({
        content: `${WebEmbed.hiddenEmbed}${SpeakerEmbedInformation}`,
      });

      console.log("Listening the user");
      this.createListeningStream();
    });

    receiver.speaking.on("end", async (userId) => {
      if (userId !== this.ListeningUserId.id) return;

      if (this.Speaking) return;
      console.log("The user has stopped to talk");
      this.currentTime = Date.now();

      while (this.Listening) {
        await delay(1);
      }

      console.log("audio loaded successfully");

      if (!this.UserAudioFileName) return console.log("The audio is not found");

      console.log("Sending the audio to the logs channel");

      let difference = Date.now() - this.currentTime;

      const StopToTalkEmbedInformation = new WebEmbed()
        .setDescription(
          SetFormat(Date.now(), "[HH:mm:SS]") +
            " Time taken to finish the audio:" +
            difference +
            "ms"
        )
        .setColor("GREEN");

      this.LogsChannel.send({
        content: `${WebEmbed.hiddenEmbed}${StopToTalkEmbedInformation}`,
        files: [new MessageAttachment(this.UserAudioFileName, "recording.mp3")],
      });

      this.currentTime = Date.now();
      const transcribe = await this.SpeechToText(this.UserAudioFileName);

      difference = Date.now() - this.currentTime;

      const TranscribedAudioInformationEmbed = new WebEmbed()
        .setDescription(
          SetFormat(Date.now(), "[HH:mm:SS]") +
            " Time taken to finish the audio transcribe:" +
            difference +
            "ms\nYou say this?:" +
            transcribe
        )
        .setColor("GREEN");

      this.LogsChannel.send({
        content: `${WebEmbed.hiddenEmbed}${TranscribedAudioInformationEmbed}`,
      });

      if (!transcribe) {
        fs.unlinkSync(this.UserAudioFileName);
        this.UserAudioFileName = undefined;
        return console.log("The text transcribed is null ");
      }

      this.Speaking = true;

      console.log("Sending the transcribed text to the IA ");
      this.IAChannel.send(transcribe);

      this.currentTime = Date.now();
      const filter = (m: Message) => m.author.id === CONSTANTS.AIDiscordBotId;

      const collector = this.IAChannel.createMessageCollector({
        filter,
        max: 1,
      });

      collector.on("collect", async (msg) => {
        console.log("Sending message that ia say to the log channel");
        difference = Date.now() - this.currentTime;

        const IATextInformationEmbed = new WebEmbed()
          .setDescription(
            SetFormat(Date.now(), "[HH:mm:SS]") +
              " Time taken to finish the IA response:" +
              difference +
              "ms\nThe IA response with this:" +
              msg.content.substring(0, 1000)
          )
          .setColor("GREEN");

        this.LogsChannel.send({
          content: `${WebEmbed.hiddenEmbed}${IATextInformationEmbed}`,
        });

        console.log("Creating the text to audio");
        this.currentTime = Date.now();

        await this.TextToSpeech(msg.content);

        difference = Date.now() - this.currentTime;

        if (!this.AIAudioFileName) {
          this.Speaking = false;
          return console.log("Audio file was not found");
        }
        const TextToSpeechInformationEmbed = new WebEmbed()
          .setDescription(
            SetFormat(Date.now(), "[HH:mm:SS]") +
              " Time taken to finish the Text to audio:" +
              difference
          )
          .setColor("GREEN");

        this.LogsChannel.send({
          content: `${WebEmbed.hiddenEmbed}${TextToSpeechInformationEmbed}`,
          files: [new MessageAttachment(this.AIAudioFileName, "recording.mp3")],
        });

        console.log("Playing the audio in the channel");
        const resource = createAudioResource(this.AIAudioFileName);

        player.play(resource);

        player.on(AudioPlayerStatus.Idle, (m) => {
          console.log("The audio was played successfully");
          console.log("Deleting the audio file and the user audio file");
          if (!this.AIAudioFileName || !this.UserAudioFileName) {
            this.Speaking = false;
            this.AIAudioFileName = undefined;
            this.UserAudioFileName = undefined;
            console.log(this.AIAudioFileName + " " + this.UserAudioFileName);
            return console.log("Audio file was not found");
          }
          fs.unlinkSync(this.AIAudioFileName);
          fs.unlinkSync(this.UserAudioFileName);
          console.log("The audio was deleted successfully");
          this.Speaking = false;
          this.AIAudioFileName = undefined;
          this.UserAudioFileName = undefined;
        });
      });
    });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function SetFormat(d: number, format: string) {
  const date = new Date(d);

  return format
    .replace("YY", date.getFullYear() + "")
    .replace("MM", date.getMonth() + "")
    .replace("DD", date.getDay() + "")
    .replace("HH", date.getHours() + "")
    .replace("SS", date.getSeconds() + "")
    .replace("mm", date.getMinutes() + "")
    .replace("ss", date.getMilliseconds() + "");
}
