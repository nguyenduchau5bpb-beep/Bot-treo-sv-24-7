const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const path = require('path');
const { spawn } = require('child_process');

const ffmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpeg;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; 

let currentVolume = 1.0; 
let activePlayer = null;
let isLooping = false; 

// 🔄 HÀM PHÁT NHẠC THÔNG MINH: AUTO ĐẢO QUA 3 CÁCH KHI CÓ LỖI
function playMp3File(guildId, methodIndex = 1) {
    const conn = getVoiceConnection(guildId);
    if (!conn) return;

    const filePath = path.join(__dirname, 'bot.mp3');
    const player = createAudioPlayer();
    activePlayer = player;

    let resource;
    let ffmpegProcess = null;

    console.log(`🎵 Đang thử phát nhạc bằng Phương thức ${methodIndex}...`);

    try {
        if (methodIndex === 1) {
            // CÁCH 1: Dùng createAudioResource trực tiếp với tệp cục bộ (Standard Stream)
            resource = createAudioResource(filePath, {
                inlineVolume: true
            });
        } 
        else if (methodIndex === 2) {
            // CÁCH 2: Dùng StreamType.Arbitrary kết hợp FFmpeg tự động nhận diện
            resource = createAudioResource(filePath, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
        } 
        else {
            // CÁCH 3: Ép luồng thủ công qua FFmpeg Spawn (Raw PCM 48kHz Stereo)
            ffmpegProcess = spawn(ffmpeg, [
                '-i', filePath,
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                'pipe:1'
            ]);

            ffmpegProcess.on('error', (err) => {
                console.error('Lỗi tiến trình FFmpeg:', err);
            });

            resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Raw,
                inlineVolume: true
            });
        }

        resource.volume.setVolume(currentVolume);
        player.play(resource);
        conn.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            if (ffmpegProcess) { try { ffmpegProcess.kill(); } catch(e) {} }
            if (isLooping && activePlayer === player) {
                // Vòng lặp tiếp tục dùng phương thức hiện tại hoặc giữ ổn định
                playMp3File(guildId, methodIndex);
            }
        });

        player.on('error', error => {
            console.error(`⚠️ Phương thức ${methodIndex} gặp lỗi:`, error.message);
            if (ffmpegProcess) { try { ffmpegProcess.kill(); } catch(e) {} }

            // 🔀 AUTO ĐẢO SANG CÁCH TIẾP THEO NẾU CÁCH TRƯỚC BỊ LỖI
            if (methodIndex < 3 && activePlayer === player && isLooping) {
                console.log(`🔄 Đang tự động đảo sang Phương thức ${methodIndex + 1}...`);
                playMp3File(guildId, methodIndex + 1);
            }
        });

    } catch (error) {
        console.error(`❌ Khởi tạo phương thức ${methodIndex} thất bại:`, error);
        // Tự động đảo cách nếu cách hiện tại sập ngay từ đầu
        if (methodIndex < 3 && isLooping) {
            playMp3File(guildId, methodIndex + 1);
        }
    }
}

const commands = [
    new SlashCommandBuilder().setName('treo').setDescription('1. Treo bot trong phòng Voice 24/7')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
    new SlashCommandBuilder().setName('thoat').setDescription('2. Đưa bot rời khỏi phòng Voice'),
    new SlashCommandBuilder().setName('playmp3').setDescription('3. Phát và tự động lặp lại vô tận file bot.mp3'),
    new SlashCommandBuilder().setName('xong').setDescription('4. Dừng phát nhạc và tắt chế độ lặp'),
    new SlashCommandBuilder().setName('am').setDescription('5. Điều chỉnh âm lượng từ 1 đến 200')
        .addIntegerOption(o => o.setName('volume').setDescription('Mức âm lượng (1-200)').setRequired(true)),
    new SlashCommandBuilder().setName('say').setDescription('6. [Admin] Sai bot nhắn tin')
        .addStringOption(o => o.setName('message').setDescription('Nội dung').setRequired(true)),
    new SlashCommandBuilder().setName('restart').setDescription('7. [Admin] Khởi động lại bot từ xa'),
    new SlashCommandBuilder().setName('status').setDescription('8. Xem trạng thái phòng treo & RAM'),
    new SlashCommandBuilder().setName('help').setDescription('9. Xem danh sách toàn bộ lệnh'),
    new SlashCommandBuilder().setName('ping').setDescription('10. Kiểm tra độ trễ'),
    new SlashCommandBuilder().setName('uptime').setDescription('11. Thời gian bot online'),
    new SlashCommandBuilder().setName('botinfo').setDescription('12. Thông tin bot'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('13. Thông tin Server'),
    new SlashCommandBuilder().setName('userinfo').setDescription('14. Thông tin cá nhân'),
    new SlashCommandBuilder().setName('avatar').setDescription('15. Xem avatar bot'),
    new SlashCommandBuilder().setName('roll').setDescription('16. Tung xúc xắc'),
    new SlashCommandBuilder().setName('coinflip').setDescription('17. Tung đồng xu'),
    new SlashCommandBuilder().setName('calc').setDescription('18. Tính toán')
        .addStringOption(o => o.setName('expression').setDescription('Phép tính').setRequired(true)),
    new SlashCommandBuilder().setName('choose').setDescription('19. Chọn ngẫu nhiên')
        .addStringOption(o => o.setName('options').setDescription('Lựa chọn').setRequired(true)),
    new SlashCommandBuilder().setName('8ball').setDescription('20. Bói vui')
        .addStringOption(o => o.setName('question').setDescription('Câu hỏi').setRequired(true)),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Đăng ký thành công các lệnh!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId, user } = interaction;

    if (commandName === 'treo') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const channelId = interaction.options.getString('channel_id');
            const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không đúng, không tồn tại, hoặc bot không có quyền truy cập phòng này!');
            }

            joinVoiceChannel({
                channelId: targetChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            await interaction.editReply(`✅ Đã vào treo thành công tại phòng **${targetChannel.name}**!`);
        } catch (error) {
            console.error('Lỗi khi treo voice:', error);
            await interaction.editReply('❌ Có lỗi xảy ra khi kết nối vào phòng Voice!');
        }
    }
    else if (commandName === 'thoat') {
        await interaction.deferReply({ ephemeral: true });
        isLooping = false;
        if (activePlayer) {
            activePlayer.stop();
            activePlayer = null;
        }
        const conn = getVoiceConnection(guildId);
        if (!conn) {
            return await interaction.editReply('❌ Bot chưa treo ở phòng nào!');
        }
        conn.destroy();
        await interaction.editReply('🛑 Đã cho bot rời khỏi phòng Voice!');
    }
    else if (commandName === 'playmp3') {
        await interaction.deferReply();
        const conn = getVoiceConnection(guildId);
        if (!conn) {
            return await interaction.editReply('❌ Bot phải ở trong phòng Voice mới phát được nhạc! Hãy dùng lệnh `/treo` trước.');
        }

        try {
            isLooping = true;
            playMp3File(guildId, 1); // Bắt đầu bằng phương thức 1, tự động đảo nếu lỗi
            await interaction.editReply(`🔁 Đang phát và **tự động lặp lại vô tận** file \`bot.mp3\` (Hệ thống Auto-Fallback 3 cách đang hoạt động, Âm lượng: **${Math.round(currentVolume * 100)}%**)`);
        } catch (error) {
            console.error('Lỗi phát mp3:', error);
            await interaction.editReply('❌ Không tìm thấy file `bot.mp3` trên GitHub hoặc lỗi khi phát!');
        }
    }
    else if (commandName === 'xong') {
        await interaction.deferReply();
        isLooping = false;
        if (activePlayer) {
            activePlayer.stop();
            activePlayer = null;
        }
        await interaction.editReply('🛑 Đã dừng phát nhạc và tắt chế độ lặp lại!');
    }
    else if (commandName === 'am') {
        const volInput = interaction.options.getInteger('volume');
        if (volInput < 0 || volInput > 200) {
            return interaction.reply({ content: '❌ Mức âm lượng phải nằm trong khoảng từ **0 đến 200**!', ephemeral: true });
        }

        currentVolume = volInput / 100;

        if (activePlayer && activePlayer.state.resource && activePlayer.state.resource.volume) {
            activePlayer.state.resource.volume.setVolume(currentVolume);
        }

        await interaction.reply(`🔊 Đã điều chỉnh âm lượng thành **${volInput}%**!`);
    }
    else if (commandName === 'say') {
        await interaction.channel.send(interaction.options.getString('message'));
        await interaction.reply({ content: '✅ Đã gửi tin nhắn!', ephemeral: true });
    }
    else if (commandName === 'restart') {
        await interaction.reply('🔄 Đang khởi động lại bot...');
        process.exit(0);
    }
    else if (commandName === 'status') {
        const conn = getVoiceConnection(guildId);
        const statusText = conn ? `✅ Đang treo tại phòng ID: \`${conn.joinConfig.channelId}\`` : '❌ Chưa treo ở đâu';
        const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('📊 Trạng Thái Bot')
            .addFields(
                { name: '🔊 Voice', value: statusText },
                { name: '🔁 Chế độ Lặp (Loop)', value: isLooping ? '✅ Đang bật (Lặp vô tận)' : '❌ Đang tắt', inline: true },
                { name: '🎚️ Âm lượng', value: `\`${Math.round(currentVolume * 100)}%\``, inline: true },
                { name: '💾 RAM', value: `\`${ram} MB\``, inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✨ HỆ THỐNG ĐIỀU KHIỂN AUDIO & LOOP 24/7 ✨')
            .addFields(
                { name: '🔊 **QUẢN LÝ VOICE & NHẠC LẶP**', value: '• `/treo <channel_id>` - Đưa bot vào phòng voice\n• `/thoat` - Rời phòng voice\n• `/playmp3` - Phát & tự động lặp lại file `bot.mp3`\n• `/xong` - Dừng phát và tắt chế độ lặp\n• `/am <1-200>` - Chỉnh âm lượng (0% - 200%)' },
                { name: '👑 **QUẢN TRỊ VIÊN**', value: '• `/say <nội dung>` - Gửi tin nhắn\n• `/restart` - Khởi động lại bot từ xa' },
                { name: '🛠️ **TIỆN ÍCH & GIẢI TRÍ**', value: '• `/status`, `/help`, `/ping`, `/uptime`, `/botinfo`, `/serverinfo`, `/userinfo`, `/avatar`, `/roll`, `/coinflip`, `/calc`, `/choose`, `/8ball`' }
            );
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'ping') {
        const sent = await interaction.reply({ content: '🏓 Đang đo...', fetchReply: true });
        await interaction.editReply(`🏓 Phản hồi: \`${sent.createdTimestamp - interaction.createdTimestamp}ms\` | WebSocket: \`${Math.round(client.ws.ping)}ms\``);
    }
    else if (commandName === 'uptime') {
        const s = Math.floor(client.uptime / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        await interaction.reply(`⏱️ Bot đã hoạt động: \`${h} giờ ${m} phút ${s % 60} giây\``);
    }
    else if (commandName === 'botinfo') {
        await interaction.reply('🤖 Bot Treo Voice 24/7 siêu nhẹ, chạy song song Node.js & Flask trên Render!');
    }
    else if (commandName === 'serverinfo') {
        const owner = await interaction.guild.fetchOwner();
        const embed = new EmbedBuilder().setColor(0xFFD700).setTitle(`🏰 ${interaction.guild.name}`)
            .addFields({ name: '👥 Thành viên', value: `${interaction.guild.memberCount}`, inline: true }, { name: '👑 Chủ Server', value: `${owner.user.tag}`, inline: true });
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'userinfo') {
        const embed = new EmbedBuilder().setColor(0xF0E68C).setTitle(`👤 ${user.tag}`)
            .addFields({ name: '🆔 ID', value: `\`${user.id}\``, inline: true });
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'avatar') {
        const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`🖼️ Avatar Bot`).setImage(client.user.displayAvatarURL({ size: 1024 }));
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'roll') {
        await interaction.reply(`🎲 Số ngẫu nhiên: **${Math.floor(Math.random() * 6) + 1}**`);
    }
    else if (commandName === 'coinflip') {
        await interaction.reply(`🪙 Kết quả: **${Math.random() < 0.5 ? 'Sấp' : 'Ngửa'}**`);
    }
    else if (commandName === 'calc') {
        const expr = interaction.options.getString('expression');
        try {
            const result = Function(`'use strict'; return (${expr})`)();
            await interaction.reply(`🔢 Kết quả: \`${expr} = ${result}\``);
        } catch {
            await interaction.reply({ content: '❌ Biểu thức không hợp lệ!', ephemeral: true });
        }
    }
    else if (commandName === 'choose') {
        const list = interaction.options.getString('options').split(',');
        const choice = list[Math.floor(Math.random() * list.length)].trim();
        await interaction.reply(`🎯 Lựa chọn của bot: **${choice}**`);
    }
    else if (commandName === '8ball') {
        const ans = ['Chắc chắn rồi!', 'Khả năng cao.', 'Hỏi lại sau.', 'Không thể.', 'Rất có thể!'];
        await interaction.reply(`🔮 Trả lời: **${ans[Math.floor(Math.random() * ans.length)]}**`);
    }
});

client.login(TOKEN);
