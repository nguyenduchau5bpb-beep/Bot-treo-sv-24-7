const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus 
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- 1. Web Server ảo duy trì Render (Chống Sleep) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Discord Music Bot (Slash Commands) đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy tại cổng ${PORT}`);
});

// --- 2. Khởi tạo Bot Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // ID của Bot lấy từ Discord Developer Portal
const MUSIC_FOLDER = path.join(__dirname, 'musics');

// Biến quản lý trạng thái phát nhạc và hàng đợi theo từng Server (Guild)
const queueMap = new Map(); 

// Đăng ký Slash Commands với Discord
const commands = [
    new SlashCommandBuilder().setName('play').setDescription('Phát nhạc ngẫu nhiên từ kho nhạc của bot'),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hiện tại, chuyển sang bài tiếp theo'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và đưa bot rời khỏi phòng'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách nhạc đang chờ'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);

    // Đăng ký lệnh lên Discord API
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Đang đăng ký Slash Commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Đã đăng ký Slash Commands thành công!');
    } catch (error) {
        console.error(error);
    }
});

// Lấy danh sách file MP3 trong thư mục musics
function getMusicFiles() {
    if (!fs.existsSync(MUSIC_FOLDER)) {
        fs.mkdirSync(MUSIC_FOLDER);
        return [];
    }
    return fs.readdirSync(MUSIC_FOLDER).filter(file => file.endsWith('.mp3'));
}

// Xử lý sự kiện khi người dùng gõ lệnh
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const guildId = interaction.guildId;
    const voiceChannel = interaction.member.voice.channel;

    if (commandName === 'play') {
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Bạn phải vào một phòng Voice trước khi dùng lệnh này!', ephemeral: true });
        }

        await interaction.deferReply();

        const files = getMusicFiles();
        if (files.length === 0) {
            return interaction.editReply('⚠️ Thư mục `musics` đang trống! Hãy thêm file .mp3 vào GitHub.');
        }

        let serverQueue = queueMap.get(guildId);

        // Nếu bot chưa kết nối, tạo kết nối mới
        if (!serverQueue) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            const player = createAudioPlayer();
            connection.subscribe(player);

            serverQueue = {
                connection,
                player,
                queue: [...files],
                currentTrack: null
            };
            queueMap.set(guildId, serverQueue);

            // Lắng nghe sự kiện kết thúc bài hát để tự chuyển bài
            player.on(AudioPlayerStatus.Idle, () => {
                playNext(guildId);
            });

            player.on('error', error => {
                console.error(`❌ Lỗi phát nhạc: ${error.message}`);
                playNext(guildId);
            });
        } else {
            serverQueue.queue.push(...files);
        }

        if (!serverQueue.currentTrack) {
            playNext(guildId);
            interaction.editReply('🎶 Đang bắt đầu phát nhạc ngẫu nhiên!');
        } else {
            interaction.editReply('➕ Đã thêm toàn bộ kho nhạc vào hàng đợi phát tiếp theo!');
        }
    } 
    
    else if (commandName === 'skip') {
        const serverQueue = queueMap.get(guildId);
        if (!serverQueue || !serverQueue.currentTrack) {
            return interaction.reply({ content: '❌ Bot hiện không phát bài nào cả!', ephemeral: true });
        }
        serverQueue.player.stop(); 
        await interaction.reply('⏭️ Đã chuyển sang bài tiếp theo!');
    } 
    
    else if (commandName === 'stop') {
        const serverQueue = queueMap.get(guildId);
        if (!serverQueue) {
            return interaction.reply({ content: '❌ Bot không có trong phòng Voice nào cả!', ephemeral: true });
        }
        serverQueue.queue = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queueMap.delete(guildId);
        await interaction.reply('🛑 Đã dừng nhạc và cho bot rời phòng!');
    }
    
    else if (commandName === 'queue') {
        const serverQueue = queueMap.get(guildId);
        if (!serverQueue || serverQueue.queue.length === 0) {
            return interaction.reply({ content: '🎵 Hàng đợi đang trống!', ephemeral: true });
        }
        const current = serverQueue.currentTrack ? `🎶 **Đang phát:** ${serverQueue.currentTrack}\n\n` : '';
        const list = serverQueue.queue.slice(0, 10).map((track, index) => `${index + 1}. ${track}`).join('\n');
        await interaction.reply(`${current}📋 **Bài tiếp theo trong hàng đợi:**\n${list}`);
    }
});

// Hàm phát bài tiếp theo ngẫu nhiên
function playNext(guildId) {
    const serverQueue = queueMap.get(guildId);
    if (!serverQueue) return;

    if (serverQueue.queue.length === 0) {
        serverQueue.queue = getMusicFiles();
        if (serverQueue.queue.length === 0) {
            serverQueue.currentTrack = null;
            return;
        }
    }

    const randomIndex = Math.floor(Math.random() * serverQueue.queue.length);
    const track = serverQueue.queue.splice(randomIndex, 1)[0];
    serverQueue.currentTrack = track;

    const filePath = path.join(MUSIC_FOLDER, track);
    const resource = createAudioResource(filePath);
    serverQueue.player.play(resource);
    console.log(`🎶 Đang phát tại server ${guildId}: ${track}`);
}

client.login(TOKEN);
