const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tokens.json');

// Hàm đọc danh sách bot từ file tokens.json
function loadBotsConfig() {
    try {
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(rawData);
        }
    } catch (e) {
        console.error("❌ Lỗi đọc file tokens.json:", e.message);
    }
    return [];
}

// Hàm lưu danh sách bot vào file tokens.json
function saveBotsConfig(config) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error("❌ Lỗi ghi file tokens.json:", e.message);
        return false;
    }
}

// Khởi chạy hệ thống quản lý bot động
let activeClients = [];

function startBots() {
    // Hủy các client cũ nếu có trước khi khởi động lại
    activeClients.forEach(({ client }) => {
        try { client.destroy(); } catch (e) {}
    });
    activeClients = [];

    const botsConfig = loadBotsConfig();
    if (botsConfig.length === 0) {
        console.warn("⚠️ Cảnh báo: Chưa có bot nào trong tokens.json!");
        return;
    }

    // Tạo các lệnh cơ bản + Lệnh thêm token mới (/addtoken)
    const baseCommands = [
        new SlashCommandBuilder().setName('treo').setDescription('Đưa TẤT CẢ các bot hợp lệ vào chung 1 phòng Voice')
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
        new SlashCommandBuilder().setName('thoat').setDescription('Đưa tất cả bot rời khỏi phòng Voice'),
        new SlashCommandBuilder().setName('status').setDescription('Xem trạng thái hoạt động của các bot'),
        new SlashCommandBuilder().setName('addtoken')
            .setDescription('Thêm hoặc cập nhật token cho bot bất kỳ (ví dụ: bot 1, 2, 3, 5, 6)')
            .addIntegerOption(o => o.setName('id').setDescription('Số thứ tự bot (VD: 1, 2, 3...)').setRequired(true))
            .addStringOption(o => o.setName('token').setDescription('Discord Bot Token').setRequired(true))
            .addStringOption(o => o.setName('client_id').setDescription('Discord Client ID').setRequired(true)),
    ];

    // Tự động sinh lệnh riêng cho từng bot đang có trong danh sách (/treobot1, /treobot2, ...)
    botsConfig.forEach(bot => {
        baseCommands.push(
            new SlashCommandBuilder().setName(`treobot${bot.id}`).setDescription(`Đưa riêng Bot ${bot.id} vào phòng Voice`)
                .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
        );
    });

    const commandsJson = baseCommands.map(command => command.toJSON());

    // Khởi chạy từng bot
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

            // 1. Lệnh /addtoken: Thêm hoặc cập nhật token trực tiếp từ Discord
            if (commandName === 'addtoken') {
                await interaction.deferReply({ ephemeral: true });
                const botId = interaction.options.getInteger('id');
                const newToken = interaction.options.getString('token');
                const newClientId = interaction.options.getString('client_id');

                let currentConfigs = loadBotsConfig();
                const existingIndex = currentConfigs.findIndex(b => b.id === botId);

                if (existingIndex >= 0) {
                    // Cập nhật nếu đã có ID này
                    currentConfigs[existingIndex].token = newToken;
                    currentConfigs[existingIndex].clientId = newClientId;
                    currentConfigs[existingIndex].name = `Bot ${botId}`;
                } else {
                    // Thêm mới nếu chưa có
                    currentConfigs.push({
                        id: botId,
                        name: `Bot ${botId}`,
                        token: newToken,
                        clientId: newClientId
                    });
                }

                if (saveBotsConfig(currentConfigs)) {
                    await interaction.editReply(`✅ Đã lưu thành công thông tin cho **Bot ${botId}**! Đang khởi động lại hệ thống bot để nhận token mới...`);
                    // Tự động restart lại các bot để nhận diện token mới ngay lập tức
                    setTimeout(() => startBots(), 1000);
                } else {
                    await interaction.editReply(`❌ Lỗi khi lưu vào file tokens.json!`);
                }
            }
            // 2. Lệnh /treo chung
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
            // 3. Lệnh riêng cho từng bot (/treobot1, /treobot2, ...)
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
            // 4. Lệnh thoát phòng
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
            // 5. Kiểm tra trạng thái
            else if (commandName === 'status') {
                const conn = getVoiceConnection(guildId);
                const status = conn ? 'Đang treo voice 24/7' : 'Đang rảnh';
                await interaction.reply({ content: `📊 **Bot ${config.id}**: ${status}`, ephemeral: true });
            }
        });

        // Bắt lỗi Token không hợp lệ để tự động bỏ qua, không làm sập server
        client.login(config.token).catch(err => {
            console.error(`⚠️ Bỏ qua Bot ${config.id} do Token không hợp lệ:`, err.message);
        });

        activeClients.push({ id: config.id, client });
    });
}

// Bắt đầu chạy lần đầu
startBots();
