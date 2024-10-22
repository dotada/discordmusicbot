const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { createAudioPlayer, NoSubscriberBehavior, AudioPlayerStatus, createAudioResource, joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');
const path = require("path");
const access = require('fs/promises');
const { ytDataAPI } = require('../../config.json');

const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));

async function downloadMp3(url, destinationPath, title) {
    return new Promise((resolve, reject) => {
        access.access(path.join(__dirname, "../../" ,`${title}.webm`), fs.constants.F_OK).then(() => {
            resolve("exists");
        }).catch(error => {
            const file = fs.createWriteStream(destinationPath);
            if (ytdl.validateURL(url)) {
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
            } else {
                reject("Not a valid URL");
            }
        });
    })
}

const loopbtn = new ButtonBuilder()
  .setCustomId('loopbtn')
  .setLabel('Loop')
  .setStyle(ButtonStyle.Primary)
  .setEmoji('🔁');

const stopbtn = new ButtonBuilder()
  .setCustomId('stopbtn')
  .setLabel('Stop')
  .setStyle(ButtonStyle.Danger)
  .setEmoji('✖️');


async function play(interaction, link) {
    loopbtn.setDisabled(false);
    stopbtn.setDisabled(false);
    const row = new ActionRowBuilder()
        .addComponents(loopbtn, stopbtn);       
    let loop = false;
    await interaction.deferReply()
        .then()
        .catch(console.error);
    let channelId = interaction.member.voice.channelId;
    let guildId = interaction.member.voice.guild.id;
    let adapterCreator = interaction.member.voice.guild.voiceAdapterCreator;
    let title = (await ytdl.getInfo(link)).videoDetails.videoId;
    await downloadMp3(link, `./${title}.webm`, title)
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
    let resource = createAudioResource(`./${title}.webm`);
    player.play(resource);
    connection.subscribe(player)
    player.on('error', async (err) => {
        connection.destroy();
        await interaction.editReply({content: err.message, ephemeral: true});
    })
    ytdl.getInfo(link, {agent: agent}).then(async info => {
        const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle("**Now Playing**")
            .setDescription(`[**${info.videoDetails.title}**](<${link}>)`);
        const msg = await interaction.editReply({components: [row], embeds: [embed]});
        const filter = i => i.customId === 'loopbtn' || i.customId === 'stopbtn';
        const collectorloop = msg.createMessageComponentCollector({filter});
        let firstreply = false;
        let reply;
        collectorloop.on('collect', async i => {
            if (i.customId === 'loopbtn') {
                loop = !loop;
                if (loop) {
                    player.on(AudioPlayerStatus.Idle, () => {
                        resource = createAudioResource(`./${title}.webm`);
                        player.play(resource);
                    });
                } else {
                    player.on(AudioPlayerStatus.Idle, async () => {
                        connection.destroy();
                        player.stop();
                        loopbtn.setDisabled(true);
                        stopbtn.setDisabled(true);
                        await interaction.editReply({components: [row], embeds: [embed]});
                        if (reply != null) {
                            await reply.delete();
                        }
                    });
                }
                const embede = new EmbedBuilder()
                    .setColor(0xFFFFFF)
                    .setTitle('**Loop**')
                    .setDescription(loop ? '**Now Looping**' : '**Now Not Looping**')
                if (!firstreply) {
                    reply = await i.reply({ embeds: [embede], fetchReply: true }).then((message) => reply = message);
                    firstreply = true;
                } else {
                    await reply.edit({embeds:[embede]}).then(() => {});
                    await i.update({ embeds: [embed] });
                }
            } else if (i.customId === 'stopbtn') {
                connection.destroy();
                loopbtn.setDisabled(true);
                stopbtn.setDisabled(true);
                player.stop();
                await i.update({ embeds: [embed], components: [row] });
                if (reply != null) {
                    await reply.delete();
                }
            }
        });
        connection.on('stateChange', async i => {
            console.log(i.status);
            if (i.status == 'ready') {
                if (loop) {
                    player.on(AudioPlayerStatus.Idle, () => {
                        resource = createAudioResource(`./${title}.webm`);
                        player.play(resource);
                    });
                } else {
                    player.on(AudioPlayerStatus.Idle, async () => {
                        connection.destroy();
                        player.stop();
                        loopbtn.setDisabled(true);
                        stopbtn.setDisabled(true);
                        await interaction.editReply({components: [row], embeds: [embed]});
                        if (reply != null) {
                            await reply.delete();
                        }
                    });
                }
            }
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
        ),
    async execute(interaction) {
        if (ytdl.validateURL(interaction.options.getString('link'))) {
            await play(interaction, interaction.options.getString('link'));
        } else {
            const {google} = require('googleapis');
            "use strict";
            const youtube = google.youtube({
                version: 'v3',
                auth: ytDataAPI
            });
            youtube.search.list({
                part: 'id, snippet',
                q: interaction.options.getString('link'),
            }).then(async res => {
                await play(interaction, `https://www.youtube.com/watch?v=${res.data.items[0].id.videoId}`);
            }).catch(async error => {
                await interaction.reply({content: error, ephemeral: true});
            })
        }
    },
};