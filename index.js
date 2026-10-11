const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const http = require('http');

// 1. Tạo Web Server giả lập để Render luôn mở cổng (tránh lỗi Deploy Failed)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Treo Voice 24/7 is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy trên cổng ${PORT}`);
});

// 2. Tự động quét các biến môi trường trên Render để lấy danh sách 6 bot
function getBotsFromEnv() {
    const bots = [];
    for (let i = 1; i <= 6; i++) {
        const token = process.env[`TOKEN_${i}`] || process.env[`Token${i}`];
        const clientId = process.env[`CLIENT_ID_${i}`] || process.env[`ID_${i}`] || process.env[`Id${i}`];

        if (token && clientId) {
            bots.push({
                id: i,
                name: `Bot ${i}`,
                token: token.trim(),
                clientId: clientId.trim()
            });
        }
    }
    return bots;
}

const botsConfig = getBotsFromEnv();

if (botsConfig.length === 0) {
    console.warn("⚠️ Chưa tìm thấy token nào trong Environment Variables trên Render!");
}

// 3. Khởi tạo danh sách lệnh Slash Command
const baseCommands = [
    new SlashCommandBuilder().setName('treo').setDescription('Đưa TẤT CẢ các bot vào chung 1 phòng Voice')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
    new SlashCommandBuilder().setName('thoat').setDescription('Đưa tất cả bot rời khỏi phòng Voice'),
    new SlashCommandBuilder().setName('status').setDescription('Xem trạng thái hoạt động của các bot'),
];

botsConfig.forEach(bot => {
    baseCommands.push(
        new SlashCommandBuilder().setName(`treobot${bot.id}`).setDescription(`Đưa riêng Bot ${bot.id} vào phòng Voice`)
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
    );
});

const commandsJson = baseCommands.map(command => command.toJSON());

// 4. Khởi chạy từng bot một cách độc lập tuyệt đối
botsConfig.forEach(config => {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    // Cố định ID riêng biệt cho từng client để tránh bị đè biến
    const currentBotId = config.id;

    client.once('ready', async () => {
        console.log(`🤖 [Thuần Treo] Bot ${currentBotId} đã sẵn sàng: ${client.user.tag}`);
        const rest = new REST({ version: '10' }).setToken(config.token);
        try {
            await rest.put(Routes.applicationCommands(config.clientId), { body: commandsJson });
        } catch (error) {
            console.error(`Lỗi đăng ký lệnh cho Bot ${currentBotId}:`, error);
        }
    });

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const { commandName, guildId } = interaction;

        // Lệnh treo tất cả: Tất cả các bot đều vào phòng và phản hồi đúng tên từng con
        if (commandName === 'treo') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const channelId = interaction.options.getString('channel_id');
                const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                
                if (!targetChannel || targetChannel.type !== 2) {
                    return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
                }

                const connection = joinVoiceChannel({
                    channelId: targetChannel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: true
                });

                connection.on('stateChange', (oldState, newState) => {
                    if (newState.status === 'disconnected') {
                        try { connection.rejoin(); } catch (e) {}
                    }
                });

                await interaction.editReply(`✅ **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** để treo!`);
            } catch (err) {
                console.error(err);
                await interaction.editReply('❌ Có lỗi xảy ra khi kết nối vào phòng voice!');
            }
        }
        // Lệnh treo riêng biệt cho từng con bot
        else if (commandName === `treobot${currentBotId}`) {
            await interaction.deferReply({ ephemeral: true });
            try {
                const channelId = interaction.options.getString('channel_id');
                const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                
                if (!targetChannel || targetChannel.type !== 2) {
                    return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
                }

                joinVoiceChannel({
                    channelId: targetChannel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: true
                });

                await interaction.editReply(`✅ Riêng **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`);
            } catch (err) {
                await interaction.editReply('❌ Có lỗi xảy ra!');
            }
        }
        else if (commandName === 'thoat') {
            await interaction.deferReply({ ephemeral: true });
            const conn = getVoiceConnection(guildId);
            if (conn) {
                conn.destroy();
                await interaction.editReply(`🛑 **Bot ${currentBotId}** đã rời phòng voice.`);
            } else {
                await interaction.editReply(`❌ **Bot ${currentBotId}** không ở trong phòng nào.`);
            }
        }
        else if (commandName === 'status') {
            const conn = getVoiceConnection(guildId);
            const status = conn ? 'Đang treo voice 24/7' : 'Đang rảnh';
            await interaction.reply({ content: `📊 **Bot ${currentBotId}**: ${status}`, ephemeral: true });
        }
    });

    client.login(config.token).catch(err => {
        console.error(`⚠️ Bỏ qua Bot ${currentBotId} do Token không hợp lệ:`, err.message);
    });
});
