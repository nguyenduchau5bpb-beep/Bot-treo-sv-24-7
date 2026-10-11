const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tokens.json');

// Đảm bảo file tokens.json luôn tồn tại
if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
}

function loadBotsConfig() {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (e) {
        return [];
    }
}

function saveBotsConfig(config) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        return false;
    }
}

let activeClients = [];

function startBots() {
    activeClients.forEach(({ client }) => {
        try { client.destroy(); } catch (e) {}
    });
    activeClients = [];

    const botsConfig = loadBotsConfig();

    // Các lệnh luôn luôn có sẵn kể cả khi chưa có token nào trong file
    const baseCommands = [
        new SlashCommandBuilder().setName('treo').setDescription('Đưa TẤT CẢ các bot hợp lệ vào chung 1 phòng Voice')
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
        new SlashCommandBuilder().setName('thoat').setDescription('Đưa tất cả bot rời khỏi phòng Voice'),
        new SlashCommandBuilder().setName('status').setDescription('Xem trạng thái hoạt động của các bot'),
        new SlashCommandBuilder().setName('addtoken')
            .setDescription('Thêm hoặc cập nhật token cho bot bất kỳ (ví dụ: bot 1, 2, 3...)')
            .addIntegerOption(o => o.setName('id').setDescription('Số thứ tự bot (VD: 1, 2, 3...)').setRequired(true))
            .addStringOption(o => o.setName('token').setDescription('Discord Bot Token').setRequired(true))
            .addStringOption(o => o.setName('client_id').setDescription('Discord Client ID').setRequired(true)),
    ];

    botsConfig.forEach(bot => {
        baseCommands.push(
            new SlashCommandBuilder().setName(`treobot${bot.id}`).setDescription(`Đưa riêng Bot ${bot.id} vào phòng Voice`)
                .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
        );
    });

    const commandsJson = baseCommands.map(command => command.toJSON());

    // Nếu chưa có bot nào trong file, ta đăng ký lệnh tạm qua một client giả lập hoặc chờ người dùng add token
    if (botsConfig.length === 0) {
        console.log("⚠️ Chưa có token nào trong tokens.json. Hãy dùng lệnh /addtoken trong Discord để thêm bot!");
        return;
    }

    botsConfig.forEach(config => {
        if (!config.token || !config.clientId) return;

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
            ]
        });

        client.once('ready', async () => {
            console.log(`🤖 [Thuần Treo] Bot ${config.id} đã sẵn sàng: ${client.user.tag}`);
            const rest = new REST({ version: '10' }).setToken(config.token);
            try {
                await rest.put(Routes.applicationCommands(config.clientId), { body: commandsJson });
            } catch (error) {
                console.error(`Lỗi đăng ký lệnh cho Bot ${config.id}:`, error);
            }
        });

        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;
            const { commandName, guildId } = interaction;

            if (commandName === 'addtoken') {
                await interaction.deferReply({ ephemeral: true });
                const botId = interaction.options.getInteger('id');
                const newToken = interaction.options.getString('token');
                const newClientId = interaction.options.getString('client_id');

                let currentConfigs = loadBotsConfig();
                const existingIndex = currentConfigs.findIndex(b => b.id === botId);

                if (existingIndex >= 0) {
                    currentConfigs[existingIndex].token = newToken;
                    currentConfigs[existingIndex].clientId = newClientId;
                    currentConfigs[existingIndex].name = `Bot ${botId}`;
                } else {
                    currentConfigs.push({
                        id: botId,
                        name: `Bot ${botId}`,
                        token: newToken,
                        clientId: newClientId
                    });
                }

                if (saveBotsConfig(currentConfigs)) {
                    await interaction.editReply(`✅ Đã lưu thành công thông tin cho **Bot ${botId}**! Đang khởi động lại hệ thống...`);
                    setTimeout(() => startBots(), 1000);
                } else {
                    await interaction.editReply(`❌ Lỗi khi lưu vào file tokens.json!`);
                }
            }
            else if (commandName === 'treo') {
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

                    await interaction.editReply(`✅ Bot ${config.id} đã vào phòng **${targetChannel.name}** để treo!`);
                } catch (err) {
                    await interaction.editReply('❌ Có lỗi xảy ra khi kết nối!');
                }
            }
            else if (commandName === `treobot${config.id}`) {
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

                    await interaction.editReply(`✅ Riêng **Bot ${config.id}** đã vào phòng **${targetChannel.name}** thành công!`);
                } catch (err) {
                    await interaction.editReply('❌ Có lỗi xảy ra!');
                }
            }
            else if (commandName === 'thoat') {
                await interaction.deferReply({ ephemeral: true });
                const conn = getVoiceConnection(guildId);
                if (conn) {
                    conn.destroy();
                    await interaction.editReply(`🛑 Bot ${config.id} đã rời phòng voice.`);
                } else {
                    await interaction.editReply(`❌ Bot ${config.id} không ở trong phòng nào.`);
                }
            }
            else if (commandName === 'status') {
                const conn = getVoiceConnection(guildId);
                const status = conn ? 'Đang treo voice 24/7' : 'Đang rảnh';
                await interaction.reply({ content: `📊 **Bot ${config.id}**: ${status}`, ephemeral: true });
            }
        });

        client.login(config.token).catch(err => {
            console.error(`⚠️ Bỏ qua Bot ${config.id} do Token không hợp lệ:`, err.message);
        });

        activeClients.push({ id: config.id, client });
    });
}

startBots();
