const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer, NoSubscriberBehavior, AudioPlayerStatus, createAudioResource } = require('@discordjs/voice');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');

const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));

async function downloadMp3(url, destinationPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destinationPath);
        let stream = ytdl(url, {
            quality: 'highestaudio',
            filter: 'audioonly',
            agent: agent,
        }).pipe(file);
        stream.on('finish', () => {
            file.close(() => resolve(`File downloaded to ${destinationPath}`));
        }).on('error', (err) => {
            fs.unlink(destinationPath, () => reject(err));
        });
    });
  }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song.')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The link to the video that should be played')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('loop')
                    .setDescription('Whether or not to loop the song')
        ),
    async execute(interaction) {
        const loopbtn = new ButtonBuilder()
            .setCustomId('loopbtn')
            .setLabel('Loop')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔁');
        
        const row = new ActionRowBuilder()
            .addComponents(loopbtn);        

        let loop = false;
        if (interaction.options.getBoolean('loop') ?? false) {
            loop = true;
        }
        interaction.deferReply()
            .then()
            .catch(console.error);
        let channelId = interaction.member.voice.channelId;
        let guildId = interaction.member.voice.guild.id;
        let adapterCreator = interaction.member.voice.guild.voiceAdapterCreator;
        await downloadMp3(interaction.options.getString('link'), `./file_${guildId}.webm`)
            .then(message => console.log(message))
            .catch(err => console.error('Error:', err));
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });
        //https://file-examples.com/storage/fee0ddbaf066ed3199cfa16/2017/11/file_example_MP3_5MG.mp3
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: adapterCreator,
        });
        let resource = createAudioResource(`./file_${guildId}.webm`);
        player.play(resource);
        connection.subscribe(player);
        if (loop) {
            player.on(AudioPlayerStatus.Idle, () => {
                resource = createAudioResource(`./file_${guildId}.webm`);
                player.play(resource);
            });
        } else {
            player.on(AudioPlayerStatus.Idle, () => {
                connection.destroy();
                player.stop();
            });
        }
        
        player.on('error', () => {
            connection.destroy();
        });

        let link = interaction.options.getString('link');

        ytdl.getInfo(link, {agent: agent}).then(async info => {
            const embed = new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle("**Now Playing**")
                .setDescription(`[**${info.videoDetails.title}**](<${link}>)`);
            const msg = await interaction.editReply({components: [row], embeds: [embed]});
            const filter = i => i.customId === 'loopbtn';
            const collector = msg.createMessageComponentCollector({filter});
            let firstreply = false;
            let reply;
            collector.on('collect', async i => {
                loop = !loop;
                const embede = new EmbedBuilder()
                  .setColor(0xFFFFFF)
                  .setTitle('**Loop**')
                  .setDescription(loop ? '**Now Looping**' : '**Now Not Looping**');
                
                if (!firstreply) {
                  reply = await i.reply({ embeds: [embede], fetchReply: true }).then((message) => reply = message);
                  firstreply = true;
                } else {
                    await reply.edit({embeds:[embede]}).then(() => {});
                    await i.update({ embeds: [embed] });
                }
            });
            connection.on('stateChange', async i => {
                if (i.status == 'ready') {
                    loopbtn.setDisabled(true);
                    await interaction.editReply({components: [row], embeds: [embed]});
                }
            })
        });
    },
};