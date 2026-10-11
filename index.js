const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const http = require('http');

// 1. Tạo Web Server giả lập cho Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Treo Voice 24/7 is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy trên cổng ${PORT}`);
});

// 2. Quét danh sách 6 bot từ biến môi trường
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

// 3. Khởi tạo bộ lệnh chung cho tất cả các bot
const baseCommands = [
    new SlashCommandBuilder().setName('treo').setDescription('Đưa TẤT CẢ các bot vào phòng Voice (cách nhau 3 giây)')
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

// 4. Khởi chạy từng bot độc lập
botsConfig.forEach(config => {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    const currentBotId = config.id;
    let activeConnection = null;

    client.once('ready', async () => {
        console.log(`🤖 [Thuần Treo] Bot ${currentBotId} đã sẵn sàng: ${client.user.tag}`);
        const rest = new REST({ version: '10' }).setToken(config.token);
        try {
            await rest.put(Routes.applicationCommands(config.clientId), { body: commandsJson });
        } catch (error) {
            console.error(`Lỗi đăng ký lệnh cho Bot ${currentBotId}:`, error);
        }
    });

    // Hàm kết nối voice độc lập cho từng bot
    async function connectToVoice(channelId, guild) {
        try {
            if (activeConnection) {
                try { activeConnection.destroy(); } catch (e) {}
            }

            activeConnection = joinVoiceChannel({
                channelId: channelId,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: true
            });

            activeConnection.on('stateChange', (oldState, newState) => {
                if (newState.status === 'disconnected') {
                    try { activeConnection.rejoin(); } catch (e) {}
                }
            });
            return true;
        } catch (err) {
            console.error(`Bot ${currentBotId} lỗi join voice:`, err);
            return false;
        }
    }

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const { commandName, guild, options } = interaction;

        // Khi gõ lệnh /treo ở bất kỳ bot nào, bot đó sẽ xử lý và tự vào phòng của nó
        if (commandName === 'treo') {
            await interaction.deferReply({ ephemeral: true });
            const channelId = options.getString('channel_id');
            
            const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            // Tính toán độ trễ dựa trên ID của bot để các con bot tự vào lần lượt (Bot 1: 0s, Bot 2: 3s, Bot 3: 6s, v.v.)
            const delayTime = (currentBotId - 1) * 3000;

            if (delayTime > 0) {
                await new Promise(resolve => setTimeout(resolve, delayTime));
            }

            const success = await connectToVoice(channelId, guild);
            if (success) {
                try {
                    await interaction.followUp({ content: `✅ **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`, ephemeral: true });
                } catch (e) {}
            }
        }
        else if (commandName === 'thoat') {
            await interaction.deferReply({ ephemeral: true });
            if (activeConnection) {
                activeConnection.destroy();
                activeConnection = null;
                await interaction.editReply(`🛑 **Bot ${currentBotId}** đã rời phòng voice.`);
            } else {
                await interaction.editReply(`❌ **Bot ${currentBotId}** không ở trong phòng nào.`);
            }
        }
        else if (commandName === 'status') {
            const status = activeConnection ? 'Đang treo voice 24/7' : 'Đang rảnh';
            await interaction.reply({ content: `📊 **Bot ${currentBotId}**: ${status}`, ephemeral: true });
        }
        else if (commandName === `treobot${currentBotId}`) {
            await interaction.deferReply({ ephemeral: true });
            const channelId = options.getString('channel_id');
            const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            await connectToVoice(channelId, guild);
            await interaction.editReply(`✅ Riêng **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`);
        }
    });

    client.login(config.token).catch(err => {
        console.error(`⚠️ Bỏ qua Bot ${currentBotId} do Token không hợp lệ:`, err.message);
    });
});
