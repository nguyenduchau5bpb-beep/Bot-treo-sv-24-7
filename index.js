const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const http = require('http');
const os = require('os');

// 1. Web Server giả lập cho Render (Duy trì 24/7)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Treo Voice 24/7 Ultimate Edition is running!\n');
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

// 3. Khởi tạo kho vũ khí Slash Commands tối tân
const commands = [
    new SlashCommandBuilder()
        .setName('treo')
        .setDescription('🚀 Đưa Bot vào phòng Voice (hỗ trợ mọi máy chủ)')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice cần treo').setRequired(true)),
    new SlashCommandBuilder()
        .setName('thoat')
        .setDescription('🛑 Đưa Bot rời khỏi phòng Voice hiện tại'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('📊 Xem trạng thái chi tiết và thời gian đã treo voice'),
    new SlashCommandBuilder()
        .setName('system')
        .setDescription('💻 Kiểm tra tài nguyên hệ thống (RAM, CPU, Uptime)'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Kiểm tra độ trễ (latency) của Bot'),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('🏰 Xem danh sách các máy chủ Bot đang tham gia'),
    new SlashCommandBuilder()
        .setName('restart')
        .setDescription('🔄 Khởi động lại Bot từ xa'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Hiển thị bảng điều khiển hướng dẫn toàn tập')
].map(command => command.toJSON());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

let activeConnection = null;
let currentChannelInfo = null;
let connectedTimestamp = null;
const botStartTime = Date.now();

client.once('ready', async () => {
    console.log(`🤖 [ULTIMATE] Bot đã sẵn sàng: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Đã nạp thành công bộ lệnh tối tân lên Discord!');
    } catch (error) {
        console.error('Lỗi đăng ký lệnh:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    if (commandName === 'treo') {
        await interaction.deferReply(); // Công khai cho mọi người cùng thấy
        const channelId = options.getString('channel_id');

        try {
            let targetChannel = null;

            // Quét tìm kênh thông minh qua cache và toàn bộ server bot tham gia
            targetChannel = await client.channels.fetch(channelId).catch(() => null);
            if (!targetChannel) {
                for (const [guildId, g] of client.guilds.cache) {
                    const found = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null);
                    if (found) {
                        targetChannel = found;
                        break;
                    }
                }
            }

            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ Không tìm thấy phòng Voice! Hãy chắc chắn Bot đã được cấp quyền **Xem kênh (View Channel)** ở server đó.');
            }

            if (activeConnection) {
                try { activeConnection.destroy(); } catch (e) {}
            }

            // Thiết lập kết nối Voice tối ưu chống rớt
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
            connectedTimestamp = Date.now();

            // Cơ chế tự động hồi phục kết nối nâng cao
            activeConnection.on('stateChange', async (oldState, newState) => {
                if (newState.status === VoiceConnectionStatus.Disconnected) {
                    try {
                        await entersState(activeConnection, VoiceConnectionStatus.Connecting, 5_000);
                    } catch {
                        try { activeConnection.rejoin(); } catch (e) {}
                    }
                }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🚀 Kết Nối Voice Thành Công')
                .addFields(
                    { name: '🔊 Phòng Voice', value: `\`${targetChannel.name}\``, inline: true },
                    { name: '🏠 Máy Chủ', value: `\`${targetChannel.guild.name}\``, inline: true },
                    { name: '⚡ Trạng Thái', value: 'Đang treo 24/7 ổn định', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ Đã xảy ra lỗi khi kết nối vào phòng voice!');
        }
    }
    else if (commandName === 'thoat') {
        await interaction.deferReply();
        if (activeConnection) {
            try { activeConnection.destroy(); } catch (e) {}
            activeConnection = null;
            currentChannelInfo = null;
            connectedTimestamp = null;
            await interaction.editReply('🛑 Bot đã ngắt kết nối và rời khỏi phòng voice.');
        } else {
            await interaction.editReply('❌ Bot hiện không ở trong phòng voice nào cả.');
        }
    }
    else if (commandName === 'status') {
        if (activeConnection && currentChannelInfo && connectedTimestamp) {
            const uptimeMs = Date.now() - connectedTimestamp;
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
            const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Trạng Thái Hoạt Động Của Bot')
                .addFields(
                    { name: '🔊 Đang Treo Tại Phòng', value: `\`${currentChannelInfo.name}\``, inline: true },
                    { name: '🏠 Thuộc Máy Chủ', value: `\`${currentChannelInfo.guildName}\``, inline: true },
                    { name: '⏱️ Thời Gian Đã Treo', value: `\`${hours} giờ ${minutes} phút ${seconds} giây\``, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: '📊 **Trạng thái:** Bot đang rảnh rỗi và chưa treo ở phòng voice nào.' });
        }
    }
    else if (commandName === 'system') {
        const totalMemory = (os.totalmem() / 1024 / 1024).toFixed(2);
        const freeMemory = (os.freemem() / 1024 / 1024).toFixed(2);
        const usedMemory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        
        const botUptimeMs = Date.now() - botStartTime;
        const bHours = Math.floor(botUptimeMs / (1000 * 60 * 60));
        const bMinutes = Math.floor((botUptimeMs % (1000 * 60 * 60)) / (1000 * 60));

        const embed = new EmbedBuilder()
            .setColor('#9900ff')
            .setTitle('💻 Hệ Thống Tài Nguyên Bot')
            .addFields(
                { name: '🧠 RAM Bot Đang Dùng', value: `\`${usedMemory} MB\``, inline: true },
                { name: '🖥️ RAM Tổng Hệ Thống', value: `\`${freeMemory} MB / ${totalMemory} MB\``, inline: true },
                { name: '⏳ Thời Gian Chạy Liên Tục (Uptime)', value: `\`${bHours} giờ ${bMinutes} phút\``, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'ping') {
        const ping = client.ws.ping;
        await interaction.reply({ content: `🏓 Pong! Độ trễ kết nối mạng của Bot là: **${ping}ms**` });
    }
    else if (commandName === 'serverinfo') {
        const guilds = client.guilds.cache.map(g => `• **${g.name}** (\`${g.memberCount} thành viên\`)`).join('\n') || 'Chưa tham gia server nào.';
        const embed = new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle(`🏰 Danh Sách Máy Chủ (${client.guilds.cache.size})`)
            .setDescription(guilds)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'restart') {
        await interaction.reply({ content: '🔄 Đang tiến hành khởi động lại hệ thống Bot...' });
        console.log('⚠️ Nhận lệnh restart từ người dùng. Đang thoát tiến trình để Render tự làm mới...');
        setTimeout(() => process.exit(0), 1000);
    }
    else if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('📖 Bảng Điều Khiển & Hướng Dẫn Tối Tân')
            .setDescription('Danh sách toàn bộ các lệnh quản lý nâng cấp của hệ thống:')
            .addFields(
                { name: '/treo [channel_id]', value: 'Đưa bot vào phòng voice (hỗ trợ mọi server bot tham gia).' },
                { name: '/thoat', value: 'Lệnh ngắt kết nối và đưa bot rời khỏi phòng voice.' },
                { name: '/status', value: 'Xem chi tiết tên phòng, server và thời gian đã treo.' },
                { name: '/system', value: 'Kiểm tra tài nguyên RAM, CPU và thời gian hoạt động của bot.' },
                { name: '/ping', value: 'Đo tốc độ phản hồi đường truyền.' },
                { name: '/serverinfo', value: 'Liệt kê danh sách các server bot đang góp mặt.' },
                { name: '/restart', value: 'Khởi động lại toàn bộ tiến trình của bot.' },
                { name: '/help', value: 'Hiển thị bảng trợ giúp này.' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed] });
    }
});

if (token) {
    client.login(token.trim()).catch(err => {
        console.error('⚠️ Lỗi đăng nhập Bot:', err.message);
    });
}
