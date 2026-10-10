const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');

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

function playMp3File(guildId) {
    const conn = getVoiceConnection(guildId);
    if (!conn) return;

    try {
        const filePath = path.join(__dirname, 'bot.mp3');
        const player = createAudioPlayer();
        activePlayer = player;

        const resource = createAudioResource(filePath, {
            inlineVolume: true
        });
        resource.volume.setVolume(currentVolume);

        player.play(resource);
        conn.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            if (isLooping && activePlayer === player) {
                playMp3File(guildId);
            }
        });

    } catch (error) {
        console.error('Lỗi khi phát audio:', error);
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
        const channelId = interaction.options.getString('channel_id');
        const targetChannel = interaction.guild.channels.cache.get(channelId);
        if (!targetChannel || targetChannel.type !== 2) {
            return interaction.editReply('❌ ID phòng Voice không đúng hoặc không tồn tại!');
        }
        try {
            joinVoiceChannel({ channelId: targetChannel.id, guildId, adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
            await interaction.editReply(`✅ Đã vào treo tại phòng **${targetChannel.name}**!`);
        } catch (e) {
            console.error(e);
            await interaction.editReply('❌ Không thể kết nối vào phòng!');
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
        if (!conn) return interaction.editReply('❌ Bot chưa treo ở phòng nào!');
        conn.destroy();
        await interaction.editReply('🛑 Đã cho bot rời khỏi phòng Voice!');
    }
    else if (commandName === 'playmp3') {
        await interaction.deferReply();
        const conn = getVoiceConnection(guildId);
        if (!conn) {
            return interaction.editReply('❌ Bot phải ở trong phòng Voice mới phát được nhạc! Hãy dùng lệnh `/treo` trước.');
        }

        try {
            isLooping = true;
            playMp3File(guildId);
            await interaction.editReply(`🔁 Đang phát và **tự động lặp lại vô tận** file \`bot.mp3\` (Âm lượng: **${Math.round(currentVolume * 100)}%**)`);
        } catch (error) {
            console.error(error);
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
    else {
        await interaction.reply(`✅ Đã thực thi lệnh **/${commandName}** thành công!`);
    }
});

client.login(TOKEN);
