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
    res.send('🤖 Discord Music Bot (24/7 + Loop) đang hoạt động!');
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
const CLIENT_ID = process.env.CLIENT_ID; 

// Khai báo đường dẫn thư mục Musics (viết hoa chữ M khớp trên GitHub)
const MUSIC_FOLDER = path.join(__dirname, 'Musics');

// Biến quản lý trạng thái phát nhạc, hàng đợi và chế độ lặp (loopMode: 'off', 'track', 'queue')
const queueMap = new Map(); 

// Đăng ký Slash Commands với Discord (Bổ sung thêm lệnh /loop)
const commands = [
    new SlashCommandBuilder().setName('play').setDescription('Phát nhạc ngẫu nhiên từ kho nhạc của bot'),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hiện tại, chuyển sang bài tiếp theo'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và đưa bot rời khỏi phòng'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách nhạc đang chờ'),
    new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Bật/tắt chế độ lặp bài hát')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Chọn kiểu lặp')
                .setRequired(true)
                .addChoices(
                    { name: 'Tắt lặp (Off)', value: 'off' },
                    { name: 'Lặp bài hiện tại (Loop Song)', value: 'track' },
                    { name: 'Lặp toàn bộ kho nhạc (Loop All)', value: 'queue' }
                )
        ),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Đang đăng ký Slash Commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Đã đăng ký Slash Commands thành công!');
    } catch (error) {
        console.error(error);
    }
});

function getMusicFiles() {
    if (!fs.existsSync(MUSIC_FOLDER)) {
        console.log("⚠️ Không tìm thấy thư mục Musics!");
        return [];
    }
    return fs.readdirSync(MUSIC_FOLDER).filter(file => file.endsWith('.mp3'));
}

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
            return interaction.editReply('⚠️ Không tìm thấy bài hát `.mp3` nào trong thư mục `Musics`!');
        }

        let serverQueue = queueMap.get(guildId);

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
                originalQueue: [...files], // Lưu lại danh sách gốc để phục vụ lặp toàn bộ
                currentTrack: null,
                loopMode: 'off' // Mặc định tắt lặp
            };
            queueMap.set(guildId, serverQueue);

            player.on(AudioPlayerStatus.Idle, () => {
                playNext(guildId);
            });

            player.on('error', error => {
                console.error(`❌ Lỗi phát nhạc: ${error.message}`);
                playNext(guildId);
            });
        } else {
            serverQueue.queue.push(...files);
            serverQueue.originalQueue = [...files];
        }

        if (!serverQueue.currentTrack) {
            playNext(guildId);
            interaction.editReply('🎶 Đang bắt đầu phát nhạc ngẫu nhiên từ thư mục `Musics`!');
        } else {
            interaction.editReply('➕ Đã thêm kho nhạc vào hàng đợi phát tiếp theo!');
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
        const current = serverQueue.currentTrack ? `🎶 **Đang phát:** ${serverQueue.currentTrack} (Chế độ lặp: **${serverQueue.loopMode}**)\n\n` : '';
        const list = serverQueue.queue.slice(0, 10).map((track, index) => `${index + 1}. ${track}`).join('\n');
        await interaction.reply(`${current}📋 **Bài tiếp theo trong hàng đợi:**\n${list}`);
    }

    else if (commandName === 'loop') {
        const serverQueue = queueMap.get(guildId);
        if (!serverQueue) {
            return interaction.reply({ content: '❌ Bot chưa phát nhạc trong server này!', ephemeral: true });
        }

        const mode = interaction.options.getString('mode');
        serverQueue.loopMode = mode;

        let modeText = 'Tắt';
        if (mode === 'track') modeText = 'Lặp lại bài hiện tại';
        if (mode === 'queue') modeText = 'Lặp lại toàn bộ kho nhạc';

        await interaction.reply(`🔁 Đã chuyển chế độ lặp thành: **${modeText}**`);
    }
});

function playNext(guildId) {
    const serverQueue = queueMap.get(guildId);
    if (!serverQueue) return;

    // Nếu đang bật chế độ lặp lại đúng 1 bài hiện tại
    if (serverQueue.loopMode === 'track' && serverQueue.currentTrack) {
        const filePath = path.join(MUSIC_FOLDER, serverQueue.currentTrack);
        const resource = createAudioResource(filePath);
        serverQueue.player.play(resource);
        console.log(`🔁 Đang lặp lại bài: ${serverQueue.currentTrack}`);
        return;
    }

    // Nếu hết hàng đợi
    if (serverQueue.queue.length === 0) {
        if (serverQueue.loopMode === 'queue') {
            // Lặp toàn bộ kho nhạc: nạp lại từ danh sách gốc
            serverQueue.queue = [...serverQueue.originalQueue];
        } else {
            // Mặc định tự động làm mới vòng lặp ngẫu nhiên để treo 24/7 không bao giờ dừng
            serverQueue.queue = getMusicFiles();
        }

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
    console.log(`🎶 Đang phát bài: ${track}`);
}

client.login(TOKEN);
