const { SlashCommandBuilder } = require("discord.js");
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stops playing (duh)"),
    async execute(interaction) {
        getVoiceConnection(interaction.member.voice.guild.id).destroy();
        await interaction.reply("Stopped playing.");
    }
}