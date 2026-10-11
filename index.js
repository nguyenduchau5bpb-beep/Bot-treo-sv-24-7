const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const http = require('http');

// 1. Web Server giả lập cho Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Treo Voice 24/7 is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy trên cổng ${PORT}`);
});

// 2. Lấy thông tin Bot 1 từ biến môi trường trên Render
const token = process.env.TOKEN_1 || process.env.Token1;
const clientId = process.env.CLIENT_ID_1 || process.env.ID_1 || process.env.Id1;

if (!token || !clientId) {
    console.error("⚠️ Chưa thiết lập TOKEN_1 hoặc CLIENT_ID_1 trong Environment Variables trên Render!");
}

// 3. Khởi tạo danh sách lệnh Slash Commands mở rộng
const commands = [
    new SlashCommandBuilder()
        .setName('treo')
        .setDescription('Đưa Bot vào phòng Voice (hỗ trợ mọi máy chủ)')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
    new SlashCommandBuilder()
        .setName('thoat')
        .setDescription('Đưa Bot rời khỏi phòng Voice'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Xem trạng thái hoạt động chi tiết của Bot'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra độ trễ (latency) của Bot'),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Xem danh sách các máy chủ mà Bot đang tham gia'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Hiển thị bảng hướng dẫn sử dụng các lệnh của Bot')
].map(command => command.toJSON());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

let activeConnection = null;
let currentChannelInfo = null;

client.once('ready', async () => {
    console.log(`🤖 Bot 1 đã sẵn sàng: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Đã đăng ký thành công bộ lệnh nâng cao cho Bot!');
    } catch (error) {
        console.error('Lỗi đăng ký lệnh:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    if (commandName === 'treo') {
        await interaction.deferReply({ ephemeral: true });
        const channelId = options.getString('channel_id');

        try {
            const targetChannel = await client.channels.fetch(channelId).catch(() => null);

            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ hoặc Bot không có mặt trong máy chủ chứa phòng này!');
            }

            if (activeConnection) {
                try { activeConnection.destroy(); } catch (e) {}
            }

            activeConnection = joinVoiceChannel({
                channelId: targetChannel.id,
                guildId: targetChannel.guild.id,
                adapterCreator: targetChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: true
            });

            currentChannelInfo = {
                name: targetChannel.name,
                guildName: targetChannel.guild.name
            };

            activeConnection.on('stateChange', (oldState, newState) => {
                if (newState.status === 'disconnected') {
                    try { activeConnection.rejoin(); } catch (e) {}
                }
            });

            await interaction.editReply(`✅ Bot đã kết nối thành công vào phòng **${targetChannel.name}** (Thuộc máy chủ: *${targetChannel.guild.name}*)!`);
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ Có lỗi xảy ra khi kết nối vào phòng voice!');
        }
    }
    else if (commandName === 'thoat') {
        await interaction.deferReply({ ephemeral: true });
        if (activeConnection) {
            try { activeConnection.destroy(); } catch (e) {}
            activeConnection = null;
            currentChannelInfo = null;
            await interaction.editReply('🛑 Bot đã rời phòng voice.');
        } else {
            await interaction.editReply('❌ Bot hiện không ở trong phòng voice nào.');
        }
    }
    else if (commandName === 'status') {
        if (activeConnection && currentChannelInfo) {
            await interaction.reply({ 
                content: `📊 **Trạng thái Bot:** Đang treo voice 24/7\n🔊 Phòng: **${currentChannelInfo.name}**\n🏠 Máy chủ: **${currentChannelInfo.guildName}**`, 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ content: `📊 **Trạng thái Bot:** Đang rảnh (Chưa vào phòng nào)`, ephemeral: true });
        }
    }
    else if (commandName === 'ping') {
        const ping = client.ws.ping;
        await interaction.reply({ content: `🏓 Pong! Độ trễ phản hồi của Bot là: **${ping}ms**`, ephemeral: true });
    }
    else if (commandName === 'serverinfo') {
        const guilds = client.guilds.cache.map(g => `• **${g.name}** (${g.memberCount} thành viên)`).join('\n') || 'Chưa tham gia server nào.';
        await interaction.reply({ content: `🏰 **Danh sách máy chủ Bot đang tham gia:**\n${guilds}`, ephemeral: true });
    }
    else if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📖 Bảng Hướng Dẫn Sử Dụng Bot Treo Voice')
            .setDescription('Dưới đây là danh sách các lệnh điều khiển bot:')
            .addFields(
                { name: '/treo [channel_id]', value: 'Đưa bot vào phòng voice theo ID kênh (hỗ trợ mọi server bot tham gia).' },
                { name: '/thoat', value: 'Lệnh ngắt kết nối và đưa bot rời khỏi phòng voice.' },
                { name: '/status', value: 'Kiểm tra thông tin chi tiết phòng và server bot đang treo.' },
                { name: '/ping', value: 'Kiểm tra độ trễ kết nối (latency) của bot.' },
                { name: '/serverinfo', value: 'Liệt kê tất cả các máy chủ mà bot đang có mặt.' },
                { name: '/help', value: 'Hiển thị bảng trợ giúp này.' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
});

if (token) {
    client.login(token.trim()).catch(err => {
        console.error('⚠️ Lỗi đăng nhập Bot:', err.message);
    });
}
 
