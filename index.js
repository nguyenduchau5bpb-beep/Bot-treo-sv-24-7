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
const activeBotInstances = [];

// 3. Khởi chạy từng bot một cách độc lập
botsConfig.forEach(config => {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    const currentBotId = config.id;
    let activeConnection = null;

    // Thiết lập bộ lệnh cho từng bot
    const botCommands = [
        new SlashCommandBuilder().setName('treo').setDescription('Đưa bot vào phòng Voice')
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
        new SlashCommandBuilder().setName('thoat').setDescription('Đưa bot rời khỏi phòng Voice'),
        new SlashCommandBuilder().setName('status').setDescription('Xem trạng thái hoạt động của bot'),
        new SlashCommandBuilder().setName(`treobot${currentBotId}`).setDescription(`Đưa riêng Bot ${currentBotId} vào phòng Voice`)
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
    ];

    // Riêng Bot 1 được cấp quyền tổng quản lý
    if (currentBotId === 1) {
        botCommands.push(
            new SlashCommandBuilder().setName('treotatca').setDescription('Đưa TẤT CẢ các bot vào phòng (cách nhau 3 giây)')
                .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
            new SlashCommandBuilder().setName('thoattatca').setDescription('Đưa tất cả bot rời khỏi phòng Voice')
        );

        for (let i = 1; i <= 6; i++) {
            botCommands.push(
                new SlashCommandBuilder().setName(`treobot${i}`).setDescription(`[Bot 1 quản lý] Đưa riêng Bot ${i} vào phòng Voice`)
                    .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
            );
        }
    }

    // Loại bỏ lệnh trùng lặp
    const uniqueCommands = Array.from(new Map(botCommands.map(cmd => [cmd.name, cmd])).values());
    const commandsJson = uniqueCommands.map(command => command.toJSON());

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
        connectVoice: async (targetChannel, guildId) => {
            try {
                if (activeConnection) {
                    try { activeConnection.destroy(); } catch (e) {}
                }
                activeConnection = joinVoiceChannel({
                    channelId: targetChannel.id,
                    guildId: guildId,
                    adapterCreator: targetChannel.guild.voiceAdapterCreator,
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
        },
        disconnectVoice: () => {
            if (activeConnection) {
                activeConnection.destroy();
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
        const { commandName, guildId } = interaction;

        // Xử lý các lệnh quản lý tổng của Bot 1
        if (currentBotId === 1) {
            if (commandName === 'treotatca') {
                await interaction.deferReply({ ephemeral: true });
                const channelId = interaction.options.getString('channel_id');
                const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                
                if (!targetChannel || targetChannel.type !== 2) {
                    return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
                }

                await interaction.editReply(`⏳ Bot 1 đang đưa lần lượt 6 bot vào phòng (mỗi con cách nhau 3 giây)...`);

                for (let i = 0; i < activeBotInstances.length; i++) {
                    const b = activeBotInstances[i];
                    await b.connectVoice(targetChannel, guildId);
                    try {
                        await interaction.followUp({ content: `✅ **Bot ${b.id}** đã vào phòng **${targetChannel.name}** thành công!`, ephemeral: true });
                    } catch (e) {}

                    if (i < activeBotInstances.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
                return;
            }
            else if (commandName === 'thoattatca') {
                await interaction.deferReply({ ephemeral: true });
                activeBotInstances.forEach(b => b.disconnectVoice());
                await interaction.editReply(`🛑 Bot 1 đã lệnh cho **tất cả các bot** rời phòng voice.`);
                return;
            }
            else if (commandName.startsWith('treobot')) {
                const targetId = parseInt(commandName.replace('treobot', ''));
                if (!isNaN(targetId) && targetId >= 1 && targetId <= 6) {
                    await interaction.deferReply({ ephemeral: true });
                    const channelId = interaction.options.getString('channel_id');
                    const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                    
                    if (!targetChannel || targetChannel.type !== 2) {
                        return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
                    }

                    const targetBot = activeBotInstances.find(b => b.id === targetId);
                    if (targetBot) {
                        await targetBot.connectVoice(targetChannel, guildId);
                        await interaction.editReply(`✅ Bot 1 đã điều khiển **Bot ${targetId}** vào phòng **${targetChannel.name}** thành công!`);
                    } else {
                        await interaction.editReply(`❌ Không tìm thấy Bot ${targetId}!`);
                    }
                    return;
                }
            }
        }

        // Xử lý các lệnh cơ bản và lệnh riêng của từng bot
        if (commandName === 'treo') {
            await interaction.deferReply({ ephemeral: true });
            const channelId = interaction.options.getString('channel_id');
            const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            await botInstance.connectVoice(targetChannel, guildId);
            await interaction.editReply(`✅ **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`);
        }
        else if (commandName === `treobot${currentBotId}`) {
            await interaction.deferReply({ ephemeral: true });
            const channelId = interaction.options.getString('channel_id');
            const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
            
            if (!targetChannel || targetChannel.type !== 2) {
                return await interaction.editReply('❌ ID phòng Voice không hợp lệ!');
            }

            await botInstance.connectVoice(targetChannel, guildId);
            await interaction.editReply(`✅ Riêng **Bot ${currentBotId}** đã vào phòng **${targetChannel.name}** thành công!`);
        }
        else if (commandName === 'thoat') {
            await interaction.deferReply({ ephemeral: true });
            if (botInstance.disconnectVoice()) {
                await interaction.editReply(`🛑 **Bot ${currentBotId}** đã rời phòng voice.`);
            } else {
                await interaction.editReply(`❌ **Bot ${currentBotId}** không ở trong phòng nào.`);
            }
        }
        else if (commandName === 'status') {
            const status = botInstance.getStatus() ? 'Đang treo voice 24/7' : 'Đang rảnh';
            await interaction.reply({ content: `📊 **Bot ${currentBotId}**: ${status}`, ephemeral: true });
        }
    });

    client.login(config.token).catch(err => {
        console.error(`⚠️ Bỏ qua Bot ${currentBotId} do Token không hợp lệ:`, err.message);
    });
});
