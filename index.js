const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const http = require('http');

// 1. Tạo Web Server giả lập cho Render (tránh lỗi Deploy Failed)
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
const activeBotInstances = [];

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

    const botInstance = {
        id: currentBotId,
        connectVoice: async (channelId, guild, voiceAdapterCreator) => {
            try {
                // Nếu bot này đang có kết nối cũ thì hủy trước
                if (activeConnection) {
                    try { activeConnection.destroy(); } catch (e) {}
                }

                // Thiết lập kết nối độc lập gắn liền với client và adapter riêng của guild đó
                activeConnection = joinVoiceChannel({
                    channelId: channelId,
                    guildId: guild.id,
                    adapterCreator: voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: true
                });

                // Cơ chế tự động kết nối lại nếu bị rớt mạng ngầm
                activeConnection.on('stateChange', async (oldState, newState) => {
                    if (newState.status === 'disconnected') {
                        try {
                            await Promise.race([
                                targetConnection.rejoin(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                            ]);
                        } catch (e) {
                            try { activeConnection.destroy(); } catch (err) {}
                            activeConnection = null;
                        }
                    }
                });

                return true;
            } catch (err) {
                console.error(`Bot ${currentBotId} lỗi join voice:`, err);
                return false;
            }
        },
        disconnectVoice: () => {
            if (activeConnection) {
                try { activeConnection.destroy(); } catch (e) {}
                activeConnection = null;
                return true;
            }
            return false;
        },
        getStatus: () => activeConnection !== null
    };

    activeBotInstances.push(botInstance);

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const { commandName, guildId, guild, options } = interaction;

        if (commandName === 'treo') {
            await interaction.deferReply({ ephemeral: true });
            const channelId = options.getString('channel_id');
            const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            await interaction.editReply(`⏳ Đang tiến hành đưa lần lượt 6 bot vào phòng (mỗi con cách nhau đúng 3 giây)...`);

            // Vòng lặp tuần tự có độ trễ 3 giây tuyệt đối giữa các bot
            for (let i = 0; i < activeBotInstances.length; i++) {
                const b = activeBotInstances[i];
                await b.connectVoice(targetChannel.id, guild, guild.voiceAdapterCreator);
                
                try {
                    await interaction.followUp({ content: `✅ **Bot ${b.id}** đã vào phòng **${targetChannel.name}** thành công!`, ephemeral: true });
                } catch (e) {}

                // Chờ đúng 3 giây trước khi chuyển sang con bot tiếp theo
                if (i < activeBotInstances.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        else if (commandName === 'thoat') {
            await interaction.deferReply({ ephemeral: true });
            activeBotInstances.forEach(b => b.disconnectVoice());
            await interaction.editReply(`🛑 Đã lệnh cho **tất cả các bot** rời phòng voice.`);
        }
        else if (commandName === 'status') {
            let statusText = '📊 **Trạng thái toàn bộ các Bot:**\n';
            activeBotInstances.forEach(b => {
                const state = b.getStatus() ? 'Đang treo voice 24/7' : 'Đang rảnh';
                statusText += `- Bot ${b.id}: ${state}\n`;
            });
            await interaction.reply({ content: statusText, ephemeral: true });
        }
        else if (commandName === `treobot${currentBotId}`) {
            await interaction.deferReply({ ephemeral: true });
            const channelId = options.getString('channel_id');
            const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            await botInstance.connectVoice(targetChannel.id, guild, guild.voiceAdapterCreator);
            await interaction.editReply(`✅ Riêng **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`);
        }
    });

    client.login(config.token).catch(err => {
        console.error(`⚠️ Bỏ qua Bot ${currentBotId} do Token không hợp lệ:`, err.message);
    });
});
