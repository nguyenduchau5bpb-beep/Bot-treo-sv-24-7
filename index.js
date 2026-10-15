const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const http = require('http');
const os = require('os');

const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'online', 
            active_connections: activeConnections.size, 
            uptime: process.uptime(),
            memory_usage: process.memoryUsage().rss / 1024 / 1024 
        }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>🔥 Bot Voice God-Mode Ultimate v4 is running smoothly!</h1>');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Web server đang càn quét trên cổng ${PORT}`);
});

const token = process.env.TOKEN_1 || process.env.Token1;
const clientId = process.env.CLIENT_ID_1 || process.env.ID_1 || process.env.Id1;

if (!token || !clientId) {
    console.error("⚠️ Quên cấu hình TOKEN_1 hoặc CLIENT_ID_1 trên Render rồi con giời ơi!");
}

const commands = [
    new SlashCommandBuilder()
        .setName('treo')
        .setDescription('🚀 [ULTIMATE] Đưa bot vào phòng Voice (treo độc lập mọi server)')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice cần treo').setRequired(true)),
    new SlashCommandBuilder()
        .setName('thoat')
        .setDescription('🛑 Đưa Bot rời khỏi phòng Voice ở server hiện tại'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('📊 Xem trạng thái treo voice tại server này'),
    new SlashCommandBuilder()
        .setName('listtreo')
        .setDescription('👑 [VIP] Xem toàn bộ danh sách các phòng voice bot đang treo trên mọi server'),
    new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('📢 [ADMIN] Gửi thông báo đến kênh chính của tất cả server bot đang tham gia')
        .addStringOption(o => o.setName('noidung').setDescription('Nội dung thông báo cần gửi').setRequired(true)),
    new SlashCommandBuilder()
        .setName('system')
        .setDescription('💻 Kiểm tra tài nguyên phần cứng siêu chi tiết (RAM, CPU, Uptime)'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Kiểm tra độ trễ mạng của Bot'),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('🏰 Xem danh sách tất cả các máy chủ Bot đang tham gia'),
    new SlashCommandBuilder()
        .setName('restart')
        .setDescription('🔄 Khởi động lại Bot từ xa ngay lập tức'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Bảng điều khiển tối tân')
].map(command => command.toJSON());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const activeConnections = new Map();
const botStartTime = Date.now();

client.once('ready', async () => {
    console.log(`🤖 [GOD-MODE] Bot đã thức giấc và sẵn sàng càn quét: ${client.user.tag}`);
    client.user.setActivity('🎧 Treo Voice 24/7 Không Nghỉ', { type: ActivityType.Streaming, url: 'https://twitch.tv/discord' });
    
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Đã nạp thành công bộ lệnh giao diện sinh động v4!');
    } catch (error) {
        console.error('Lỗi đăng ký lệnh:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guildId, member, guild } = interaction;

    if (commandName === 'treo') {
        await interaction.deferReply();
        const channelId = options.getString('channel_id');

        try {
            let targetChannel = null;

            targetChannel = await client.channels.fetch(channelId).catch(() => null);
            if (!targetChannel) {
                for (const [gId, g] of client.guilds.cache) {
                    const found = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null);
                    if (found) {
                        targetChannel = found;
                        break;
                    }
                }
            }

            if (!targetChannel || targetChannel.type !== 2) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ LỖI KẾT NỐI PHÒNG VOICE')
                    .setDescription('> ID phòng Voice không hợp lệ hoặc Bot chưa được cấp quyền **Xem kênh (View Channel)** ở server đó rồi đại gia ơi! 😭')
                    .setTimestamp();
                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            const targetGuildId = targetChannel.guild.id;

            if (activeConnections.has(targetGuildId)) {
                try { activeConnections.get(targetGuildId).connection.destroy(); } catch (e) {}
            }

            const connection = joinVoiceChannel({
                channelId: targetChannel.id,
                guildId: targetGuildId,
                adapterCreator: targetChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: true
            });

            activeConnections.set(targetGuildId, {
                connection,
                channelId: targetChannel.id,
                channelName: targetChannel.name,
                guildName: targetChannel.guild.name,
                timestamp: Date.now()
            });

            connection.on('stateChange', async (oldState, newState) => {
                if (newState.status === VoiceConnectionStatus.Disconnected) {
                    try {
                        await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
                    } catch {
                        try { connection.rejoin(); } catch (e) { activeConnections.delete(targetGuildId); }
                    }
                } else if (newState.status === VoiceConnectionStatus.Destroyed) {
                    activeConnections.delete(targetGuildId);
                }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF66')
                .setTitle('🚀 KÍCH HOẠT TREO VOICE THÀNH CÔNG')
                .setDescription('> Hệ thống đa luồng độc lập đã chính thức vận hành 24/7! ⚡')
                .addFields(
                    { name: '🔊 Phòng Voice', value: `\`\`\`fix\n${targetChannel.name}\`\`\``, inline: true },
                    { name: '🏠 Máy Chủ', value: `\`\`\`css\n${targetChannel.guild.name}\`\`\``, inline: true },
                    { name: '🟢 Trạng Thái', value: '`Đang kết nối & cày giờ ổn định`', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Bot Voice Gaming Hub Ultimate' });

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            const errEmbed = new EmbedBuilder().setColor('#FF3300').setDescription('❌ Lỗi kết nối cực mạnh! Kiểm tra lại quyền của bot đi mày.');
            await interaction.editReply({ embeds: [errEmbed] });
        }
    }
    else if (commandName === 'thoat') {
        await interaction.deferReply();
        if (activeConnections.has(guildId)) {
            try { activeConnections.get(guildId).connection.destroy(); } catch (e) {}
            activeConnections.delete(guildId);
            const embed = new EmbedBuilder().setColor('#FFAA00').setTitle('🛑 ĐÃ RỜI PHÒNG VOICE').setDescription('> Bot đã ngắt kết nối và thu hồi quân lực khỏi server này.');
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder().setColor('#FF0000').setDescription('❌ Bot có đang treo cái khỉ gì ở server này đâu mà đòi thoát.');
            await interaction.editReply({ embeds: [embed] });
        }
    }
    else if (commandName === 'status') {
        const info = activeConnections.get(guildId);
        if (info) {
            const uptimeMs = Date.now() - info.timestamp;
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
            const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📊 TRẠNG THÁI TREO TẠI SERVER')
                .addFields(
                    { name: '🔊 Phòng Đang Treo', value: `\`${info.channelName}\``, inline: true },
                    { name: '⏱️ Thời Gian Chạy', value: `\`${hours} giờ ${minutes} phút ${seconds} giây\``, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder().setColor('#FFCC00').setDescription('📊 Server này đang rảnh rỗi, bot chưa được lệnh treo phòng nào cả.');
            await interaction.reply({ embeds: [embed] });
        }
    }
    else if (commandName === 'listtreo') {
        if (activeConnections.size === 0) {
            const embed = new EmbedBuilder().setColor('#888888').setDescription('💤 Bot hiện đang không treo ở bất kỳ phòng voice nào trên toàn bộ hệ thống.');
            return await interaction.reply({ embeds: [embed] });
        }

        let desc = '';
        let index = 1;
        for (const [gId, info] of activeConnections.entries()) {
            const uptimeMs = Date.now() - info.timestamp;
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
            const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
            desc += `🔹 **${index++}. Server:** \`${info.guildName}\`\n   └ 🔊 **Phòng:** \`${info.channelName}\` (Đã treo: \`${hours}h ${minutes}m\`)\n\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#FF00FF')
            .setTitle(`👑 DANH SÁCH TOÀN BỘ PHÒNG ĐANG TREO (${activeConnections.size})`)
            .setDescription(desc)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'broadcast') {
        const isOwner = guild.ownerId === member.id;
        const isAdmin = member.permissions.has('Administrator');

        if (!isOwner && !isAdmin) {
            return await interaction.reply({ content: '❌ Mày không phải Chủ sở hữu hoặc Quản trị viên (Admin) của server này, cút ngay!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const noiDung = options.getString('noidung');

        let successCount = 0;
        let failCount = 0;

        const broadcastEmbed = new EmbedBuilder()
            .setColor('#FFCC00')
            .setTitle('📢 THÔNG BÁO TỪ QUẢN TRỊ VIÊN')
            .setDescription(`> ${noiDung}`)
            .setTimestamp()
            .setFooter({ text: 'Broadcast System • 24/7 Service' });

        for (const [gId, g] of client.guilds.cache) {
            try {
                const channel = g.channels.cache.find(c => c.type === 0 && c.permissionsFor(g.members.me).has('SendMessages'));
                if (channel) {
                    await channel.send({ embeds: [broadcastEmbed] });
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (e) {
                failCount++;
            }
        }

        const resEmbed = new EmbedBuilder()
            .setColor('#00FF66')
            .setTitle('✅ GỬI THÔNG BÁO HOÀN TẤT')
            .setDescription(`- Đã phát thành công tới: **${successCount}** máy chủ\n- Thất bại / Kẹt quyền: **${failCount}** máy chủ`);

        await interaction.editReply({ embeds: [resEmbed] });
    }
    else if (commandName === 'system') {
        const totalMemory = (os.totalmem() / 1024 / 1024).toFixed(2);
        const freeMemory = (os.freemem() / 1024 / 1024).toFixed(2);
        const usedMemory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
        
        const botUptimeMs = Date.now() - botStartTime;
        const bHours = Math.floor(botUptimeMs / (1000 * 60 * 60));
        const bMinutes = Math.floor((botUptimeMs % (1000 * 60 * 60)) / (1000 * 60));

        const embed = new EmbedBuilder()
            .setColor('#9900FF')
            .setTitle('💻 THÔNG SỐ HỆ THỐNG VIP')
            .addFields(
                { name: '🧠 RAM Bot Đang Dùng', value: `\`${usedMemory} MB\``, inline: true },
                { name: '🖥️ RAM Trống / Tổng', value: `\`${freeMemory} MB / ${totalMemory} MB\``, inline: true },
                { name: '⚙️ CPU Info', value: `\`${cpuModel}\``, inline: false },
                { name: '⏳ Uptime Bot', value: `\`${bHours} giờ ${bMinutes} phút\``, inline: true },
                { name: '🌐 Kết Nối Voice', value: `\`${activeConnections.size} phòng đang chạy\`\``, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'ping') {
        const sent = await interaction.reply({ content: '🏓 Đang đo đạc tốc độ mạng...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        const embed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('🏓 PONG! ĐO LƯỜNG TỐC ĐỘ')
            .addFields(
                { name: '⚡ Độ Trễ Phản Hồi API', value: `\`${latency}ms\``, inline: true },
                { name: '📡 Độ Trễ WebSocket', value: `\`${client.ws.ping}ms\``, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
    }
    else if (commandName === 'serverinfo') {
        const guilds = client.guilds.cache.map(g => `• **${g.name}** (\`${g.memberCount} thành viên\`)`).join('\n') || 'Chưa tham gia server nào.';
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`🏰 DANH SÁCH MÁY CHỦ (${client.guilds.cache.size})`)
            .setDescription(guilds)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'restart') {
        const isOwner = guild.ownerId === member.id;
        const isAdmin = member.permissions.has('Administrator');

        if (!isOwner && !isAdmin) {
            return await interaction.reply({ content: '❌ Mày không có quyền Admin/Owner ở server này để ép restart!', ephemeral: true });
        }
        await interaction.reply({ content: '🔄 Đang ra lệnh ép khởi động lại tiến trình hệ thống...' });
        setTimeout(() => process.exit(0), 1000);
    }
    else if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('📖 BẢNG ĐIỀU KHIỂN GOD-MODE ULTIMATE')
            .setDescription('> Danh sách toàn bộ lệnh tối tân hỗ trợ cày giờ voice 24/7:')
            .addFields(
                { name: '🚀 `/treo [channel_id]`', value: 'Đưa bot vào phòng voice độc lập mọi server.' },
                { name: '🛑 `/thoat`', value: 'Đá bot rời khỏi phòng voice tại server hiện tại.' },
                { name: '📊 `/status`', value: 'Xem thông tin thời gian treo voice ở server đang đứng.' },
                { name: '👑 `/listtreo`', value: 'Liệt kê toàn bộ các phòng voice đang chạy trên toàn hệ thống.' },
                { name: '📢 `/broadcast [noidung]`', value: '[Admin/Owner] Phát thông báo đến mọi server.' },
                { name: '💻 `/system`', value: 'Kiểm tra tài nguyên phần cứng RAM, CPU và kết nối.' },
                { name: '🏓 `/ping`', value: 'Đo tốc độ phản hồi và độ trễ mạng.' },
                { name: '🏰 `/serverinfo`', value: 'Xem danh sách các máy chủ bot đang góp mặt.' },
                { name: '🔄 `/restart`', value: '[Admin/Owner] Ép bot khởi động lại từ xa.' }
            )
            .setTimestamp()
            .setFooter({ text: 'Bảng điều khiển độc quyền - God-Mode Hub' });

        await interaction.reply({ embeds: [helpEmbed] });
    }
});

if (token) {
    client.login(token.trim()).then(() => {
        console.log('✅ Đã kết nối thành công tới Discord API với giao diện v4!');
    }).catch(err => {
        console.error('🔥 LỖI LOGIN CHI TIẾT:', err);
    });
}
