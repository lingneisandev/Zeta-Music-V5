import { Client, Collection, GatewayIntentBits, Options } from 'discord.js';
import { Kazagumo, KazagumoOptions } from 'kazagumo';
import { Connectors } from 'shoukaku';
import { PrismaClient } from '@prisma/client';
import NodeCache from 'node-cache';
import chalk from 'chalk';
import gradient from 'gradient-string';
import 'dotenv/config';
import KazagumoSpotify from 'kazagumo-spotify';
import { Logger } from './utils/logger';
import { Command } from './types/command';
import { CommandHandler } from './handlers/CommandHandler';
import { EventHandler } from './handlers/EventHandler';
import { ComponentHandler } from './handlers/ComponentHandler';
import { MusicHandler } from './handlers/MusicHandler';
import { GuildPlayer } from './managers/PlayerManager';

export class CreoClient extends Client {
  public commands: Collection<string, Command> = new Collection();
  public aliases: Collection<string, string> = new Collection();
  public db: PrismaClient = new PrismaClient({});
  public cache: NodeCache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 1000 });
  public music!: Kazagumo;
  public guildPlayers: Collection<string, GuildPlayer> = new Collection();

    public commandHandler = new CommandHandler(this);
  public eventHandler = new EventHandler(this);
  public componentHandler = new ComponentHandler(this);
  public musicHandler = new MusicHandler(this);

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
      makeCache: Options.cacheWithLimits({
        MessageManager: 10,
        StageInstanceManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        ThreadManager: 0,
        ThreadMemberManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        AutoModerationRuleManager: 0,
      }),
      sweepers: {
        messages: {
          interval: 300,
          lifetime: 600,
        },
      },
      allowedMentions: { repliedUser: false },
    });
  }

  public async start() {
    process.on('unhandledRejection', (reason) => {
      console.error('[Unhandled Rejection]', reason);
    });
    process.on('uncaughtException', (error) => {
      console.error('[Uncaught Exception]', error);
    });

    const isMasterShard = !this.shard || this.shard.ids[0] === 0;
    const themeGradient = gradient('#FF00D9', '#00E7FF', '#AD00FF');
    const cyberGradient = gradient('#00FF7F', '#00E7FF');

    if (isMasterShard) {
      console.clear();
      process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
      const asciiArt = `
███████╗███████╗████████╗ █████╗ 
╚══███╔╝██╔════╝╚══██╔══╝██╔══██╗
  ███╔╝ █████╗     ██║   ███████║
 ███╔╝  ██╔══╝     ██║   ██╔══██║
███████╗███████╗   ██║   ██║  ██║
╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝
`;
      console.log(themeGradient.multiline(asciiArt));
      console.log(chalk.gray('      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(`      ${themeGradient('» SYSTEM STATUS «')}`);
      console.log(`      ${chalk.gray('•')} ${chalk.whiteBright('Node.js:')} ${chalk.cyan(process.version)}`);
      console.log(`      ${chalk.gray('•')} ${chalk.whiteBright('Platform:')} ${chalk.cyan(process.platform)}`);
      console.log(`      ${chalk.gray('•')} ${chalk.whiteBright('Memory:')} ${chalk.cyan((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB')}`);
      console.log(chalk.gray('      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }

        const animate = async (text: string, action: () => Promise<string | void>) => {
      if (!isMasterShard) {
        await action();
        return;
      }
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;
      const interval = setInterval(() => {
        const frame = themeGradient(frames[i = ++i % frames.length]);
        process.stdout.write(`\r      ${frame} ${chalk.gray(text)}`);
      }, 80);
      try {
        const res = await action();
        clearInterval(interval);
        process.stdout.write(`\r      ${chalk.hex('#00FF7F')('✔')} ${cyberGradient(res || text)}${' '.repeat(20)}\n`);
      } catch (e) {
        clearInterval(interval);
        process.stdout.write(`\r      ${chalk.hex('#FF003C')('✖')} ${chalk.red(text)}${' '.repeat(20)}\n`);
        throw e;
      }
    };

    await animate('Initializing Database...', async () => {
      await this.db.$connect();
      return 'Prisma Database Synchronized';
    });

    await animate('Indexing Commands...', async () => {
      const res = await this.commandHandler.load();
      return res;
    });

    await animate('Booting Music Engine...', async () => {
      this.initMusic();
      return 'Lavalink Clusters Active';
    });

    await animate('Binding Event Listeners...', async () => {
      const res = await this.eventHandler.load();
      return res;
    });

    await animate('Readying Component Routes...', async () => {
      const res = await this.componentHandler.load();
      return res;
    });

    await animate('Authenticating with Discord...', async () => {
      await this.login(process.env.BOT_TOKEN);
      return `Authorized as ${this.user?.tag}`;
    });

        if (isMasterShard) {
      setInterval(async () => {
        try {
          const now = new Date();
          const expiredPremium = await this.db.premiumUser.findMany({ where: { expiresAt: { lt: now } } });
          const expiredNP = await this.db.noPrefixUser.findMany({ where: { expiresAt: { lt: now } } });

          for (const user of expiredPremium) {
            await this.db.premiumUser.delete({ where: { userId: user.userId } });
            const targetUser = await this.users.fetch(user.userId).catch(() => null);
            if (targetUser) Logger.logPremium('Expired', targetUser, 'Premium access automatically expired.');
          }

          for (const user of expiredNP) {
            await this.db.noPrefixUser.delete({ where: { userId: user.userId } });
            const targetUser = await this.users.fetch(user.userId).catch(() => null);
            if (targetUser) Logger.logNP('Expired', targetUser, 'No-Prefix access automatically expired.');
          }
        } catch (e) {
          console.error('[Expiry Task Error]', e);
        }
      }, 60 * 60 * 1000);

      console.log(chalk.gray('      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(`      ${themeGradient('» Zeta Music is now Online and Ready «')}`);
      console.log(chalk.gray('      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    }
  }

  private initMusic() {
    const Nodes = [{
      name: process.env.LAVALINK_NAME || 'ZetaNode',
      url: process.env.LAVALINK_HOST || process.env.LAVALINK_URL || 'nodelink.gdjkhp.com:443',
      auth: process.env.LAVALINK_PASSWORD || process.env.LAVALINK_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP1_NAME || 'ZetaNode-Backup1',
      url: process.env.LAVALINK_BACKUP1_URL || '',
      auth: process.env.LAVALINK_BACKUP1_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP1_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP2_NAME || 'ZetaNode-Backup2',
      url: process.env.LAVALINK_BACKUP2_URL || '',
      auth: process.env.LAVALINK_BACKUP2_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP2_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP3_NAME || 'ZetaNode-Backup3',
      url: process.env.LAVALINK_BACKUP3_URL || '',
      auth: process.env.LAVALINK_BACKUP3_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP3_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP4_NAME || 'ZetaNode-Backup4',
      url: process.env.LAVALINK_BACKUP4_URL || '',
      auth: process.env.LAVALINK_BACKUP4_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP4_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP5_NAME || 'ZetaNode-Backup5',
      url: process.env.LAVALINK_BACKUP5_URL || '',
      auth: process.env.LAVALINK_BACKUP5_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP5_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP6_NAME || 'ZetaNode-Backup6',
      url: process.env.LAVALINK_BACKUP6_URL || '',
      auth: process.env.LAVALINK_BACKUP6_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP6_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP7_NAME || 'ZetaNode-Backup7',
      url: process.env.LAVALINK_BACKUP7_URL || '',
      auth: process.env.LAVALINK_BACKUP7_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP7_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP8_NAME || 'ZetaNode-Backup8',
      url: process.env.LAVALINK_BACKUP8_URL || '',
      auth: process.env.LAVALINK_BACKUP8_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP8_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP9_NAME || 'ZetaNode-Backup9',
      url: process.env.LAVALINK_BACKUP9_URL || '',
      auth: process.env.LAVALINK_BACKUP9_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP9_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP10_NAME || 'ZetaNode-Backup10',
      url: process.env.LAVALINK_BACKUP10_URL || '',
      auth: process.env.LAVALINK_BACKUP10_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP10_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP11_NAME || 'ZetaNode-Backup11',
      url: process.env.LAVALINK_BACKUP11_URL || '',
      auth: process.env.LAVALINK_BACKUP11_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP11_SECURE === 'true'
    },
    {
      name: process.env.LAVALINK_BACKUP12_NAME || 'ZetaNode-Backup12',
      url: process.env.LAVALINK_BACKUP12_URL || '',
      auth: process.env.LAVALINK_BACKUP12_AUTH || 'youshallnotpass',
      secure: process.env.LAVALINK_BACKUP12_SECURE === 'true'
                   }].filter((node) => node.url.trim() !== '');

    this.music = new Kazagumo({
      defaultSearchEngine: 'youtube',
      plugins: [
        new KazagumoSpotify({
          clientId: process.env.SPOTIFY_CLIENT_ID || '',
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
          playlistPageLimit: 2,
          albumPageLimit: 2,
          searchLimit: 10,
        })
      ],
      send: (guildId, payload) => {
        const guild = this.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      }
    }, new Connectors.DiscordJS(this), Nodes, {
      moveOnDisconnect: true,
      resumable: true,
      resumableTimeout: 30,
      reconnectTries: 5,
      reconnectInterval: 5000,
      restTimeout: 10000
    });

    this.musicHandler.load();
  }
}

const client = new CreoClient();
client.start().catch((error) => {
  console.error(chalk.red('\n[FATAL ERROR] Bot failed to start:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error(chalk.red('\n[Unhandled Rejection]'), reason);
  Logger.logError(reason instanceof Error ? reason : new Error(String(reason)), 'Unhandled Rejection');
});

process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('\n[Uncaught Exception]'), error);
  Logger.logError(error, 'Uncaught Exception');
});
