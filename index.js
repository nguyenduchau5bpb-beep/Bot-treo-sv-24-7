const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

// 🤖 ĐỌC DANH SÁCH 6 BOT TỪ BIẾN MÔI TRƯỜNG BOTS_DATA (DẠNG JSON)
let botsConfig = [];
try {
    botsConfig = JSON.parse(process.env.BOTS_DATA || '[]');
} catch (e) {
    console.error("❌ Lỗi đọc cấu hình BOTS_DATA (phải đúng định dạng JSON):", e.message);
}

if (botsConfig.length === 0) {
    console.warn("⚠️ Cảnh báo: Chưa có bot nào được cấu hình trong BOTS_DATA!");
}

// 🛠️ TẠO HỆ THỐNG LỆNH SLASH COMMAND
const baseCommands = [
    new SlashCommandBuilder().setName('treo').setDescription('Đưa TẤT CẢ các bot vào chung 1 phòng Voice')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true)),
    new SlashCommandBuilder().setName('thoat').setDescription('Đưa tất cả bot rời khỏi phòng Voice'),
    new SlashCommandBuilder().setDescription('Xem trạng thái hoạt động của bot').setName('status'),
];

// Tự động sinh lệnh riêng cho từng bot (/treobot1, /treobot2, ..., /treobot6)
botsConfig.forEach(bot => {
    baseCommands.push(
        new SlashCommandBuilder().setName(`treobot${bot.id}`).setDescription(`Đưa riêng ${bot.name} vào phòng Voice`)
            .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
    );
});

const commandsJson = baseCommands.map(command => command.toJSON());

// Khởi chạy từng bot song song
botsConfig.forEach(config => {
    if (!config.token || !config.clientId) return;

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    client.once('ready', async () => {
        console.log(`🤖 [Thuần Treo] ${config.name} đã sẵn sàng: ${client.user.tag}`);
        
        // Đăng ký lệnh cho từng bot
        const rest = new REST({ version: '10' }).setToken(config.token);
        try {
            await rest.put(Routes.applicationCommands(config.clientId), { body: commandsJson });
        } catch (error) {
            console.error(`Lỗi đăng ký lệnh cho ${config.name}:`, error);
        }
    });

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const { commandName, guildId } = interaction;

        // 1. Lệnh /treo chung: Đưa tất cả bot vào chung 1 phòng
        if (commandName === 'treo') {
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

                await interaction.editReply(`✅ ${config.name} đã vào phòng **${targetChannel.name}** để treo!`);
            } catch (err) {
                await interaction.editReply('❌ Có lỗi xảy ra khi kết nối!');
            }
        }
        // 2. Lệnh riêng cho từng bot (/treobot1, /treobot2, ..., /treobot6)
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

                await interaction.editReply(`✅ Riêng **${config.name}** đã vào phòng **${targetChannel.name}** thành công!`);
            } catch (err) {
                await interaction.editReply('❌ Có lỗi xảy ra!');
            }
        }
        // 3. Lệnh thoát phòng
        else if (commandName === 'thoat') {
            await interaction.deferReply({ ephemeral: true });
            const conn = getVoiceConnection(guildId);
            if (conn) {
                conn.destroy();
                await interaction.editReply(`🛑 ${config.name} đã rời phòng voice.`);
            } else {
                await interaction.editReply(`❌ ${config.name} không ở trong phòng nào.`);
            }
        }
        // 4. Kiểm tra trạng thái
        else if (commandName === 'status') {
            const conn = getVoiceConnection(guildId);
            const status = conn ? 'Đang treo voice 24/7' : 'Đang rảnh';
            await interaction.reply({ content: `📊 **${config.name}**: ${status}`, ephemeral: true });
        }
    });

    client.login(config.token);
});
 
