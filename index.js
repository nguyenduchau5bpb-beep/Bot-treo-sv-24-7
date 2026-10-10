const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');

// --- 1. Web Server ảo chống Sleep Render ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot Discord 20 Lệnh đang hoạt động 24/7!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy tại cổng ${PORT}`);
});

// --- 2. Khởi tạo Bot ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; 

// --- 3. Đăng ký ĐÚNG 20 Slash Commands (Phân quyền Admin) ---
const commands = [
    // 🔊 Quản lý Voice (Cần quyền Admin / ManageGuild)
    new SlashCommandBuilder()
        .setName('treo')
        .setDescription('1. [Admin] Treo bot trong phòng Voice 24/7 bằng ID')
        .addStringOption(o => o.setName('channel_id').setDescription('ID phòng Voice').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        
    new SlashCommandBuilder()
        .setName('thoat')
        .setDescription('2. [Admin] Đưa bot rời khỏi phòng Voice')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('say')
        .setDescription('3. [Admin] Sai bot phát ngôn một tin nhắn')
        .addStringOption(o => o.setName('message').setDescription('Nội dung tin nhắn').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('restart')
        .setDescription('4. [Admin] Khởi động lại bot từ xa')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    // 📊 Trạng thái & Tiện ích (Ai cũng dùng được)
    new SlashCommandBuilder().setName('status').setDescription('5. Xem trạng thái phòng treo và RAM tiêu thụ'),
    new SlashCommandBuilder().setName('help').setDescription('6. Xem danh sách toàn bộ 20 lệnh của bot'),
    new SlashCommandBuilder().setName('ping').setDescription('7. Kiểm tra độ trễ phản hồi của bot'),
    new SlashCommandBuilder().setName('uptime').setDescription('8. Xem thời gian bot đã hoạt động liên tục'),
    new SlashCommandBuilder().setName('botinfo').setDescription('9. Xem thông tin giới thiệu về bot'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('10. Xem thông tin cơ bản về Server này'),
    new SlashCommandBuilder().setName('userinfo').setDescription('11. Xem thông tin tài khoản của bạn'),
    new SlashCommandBuilder().setName('avatar').setDescription('12. Xem ảnh đại diện (Avatar) của bot'),

    // 🎲 Giải trí & Tương tác (Ai cũng dùng được)
    new SlashCommandBuilder().setName('roll').setDescription('13. Tung con xúc xắc ngẫu nhiên (1 - 6)'),
    new SlashCommandBuilder().setName('coinflip').setDescription('14. Tung đồng xu (Sấp hoặc Ngửa)'),
    new SlashCommandBuilder().setName('calc').setDescription('15. Tính phép toán đơn giản')
        .addStringOption(o => o.setName('expression').setDescription('Ví dụ: 12 + 45 * 2').setRequired(true)),
    new SlashCommandBuilder().setName('choose').setDescription('16. Nhờ bot lựa chọn ngẫu nhiên')
        .addStringOption(o => o.setName('options').setDescription('Ví dụ: Cơm, Phở, Bún').setRequired(true)),
    new SlashCommandBuilder().setName('8ball').setDescription('17. Hỏi quả cầu may mắn một câu hỏi')
        .addStringOption(o => o.setName('question').setDescription('Câu hỏi').setRequired(true)),
    new SlashCommandBuilder().setName('rate').setDescription('18. Cho bot chấm điểm 1 thứ gì đó')
        .addStringOption(o => o.setName('thing').setDescription('Thứ cần chấm điểm').setRequired(true)),
    new SlashCommandBuilder().setName('hug').setDescription('19. Gửi một cái ôm đến bạn bè')
        .addUserOption(o => o.setName('user').setDescription('Thành viên muốn ôm').setRequired(true)),
    new SlashCommandBuilder().setName('poke').setDescription('20. Chọc ghẹo một ai đó')
        .addUserOption(o => o.setName('user').setDescription('Thành viên muốn chọc').setRequired(true)),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Đang cập nhật 20 Slash Commands phân quyền Admin...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Cập nhật thành công 20 lệnh!');
    } catch (error) {
        console.error(error);
    }
});

// --- 4. Xử lý các lệnh ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId, user } = interaction;

    // 1. /treo [Admin]
    if (commandName === 'treo') {
        const channelId = interaction.options.getString('channel_id');
        const targetChannel = interaction.guild.channels.cache.get(channelId);
        if (!targetChannel || targetChannel.type !== 2) {
            return interaction.reply({ content: '❌ ID phòng Voice không đúng hoặc không tồn tại!', ephemeral: true });
        }
        try {
            joinVoiceChannel({ channelId: targetChannel.id, guildId, adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
            await interaction.reply(`✅ Đã vào treo 24/7 tại phòng **${targetChannel.name}**!`);
        } catch (e) {
            await interaction.reply({ content: '❌ Không thể kết nối vào phòng!', ephemeral: true });
        }
    }
    // 2. /thoat [Admin]
    else if (commandName === 'thoat') {
        const conn = getVoiceConnection(guildId);
        if (!conn) return interaction.reply({ content: '❌ Bot chưa treo ở phòng nào!', ephemeral: true });
        conn.destroy();
        await interaction.reply('🛑 Đã cho bot rời khỏi phòng Voice!');
    }
    // 3. /say [Admin]
    else if (commandName === 'say') {
        await interaction.channel.send(interaction.options.getString('message'));
        await interaction.reply({ content: '✅ Đã gửi tin nhắn!', ephemeral: true });
    }
    // 4. /restart [Admin]
    else if (commandName === 'restart') {
        await interaction.reply('🔄 Đang khởi động lại bot...');
        process.exit(0);
    }
    // 5. /status
    else if (commandName === 'status') {
        const conn = getVoiceConnection(guildId);
        const statusText = conn ? `✅ Đang treo tại phòng ID: \`${conn.joinConfig.channelId}\`` : '❌ Chưa treo ở đâu';
        const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('📊 Trạng Thái Bot')
            .addFields({ name: '🔊 Voice', value: statusText }, { name: '💾 RAM', value: `\`${ram} MB\``, inline: true });
        await interaction.reply({ embeds: [embed] });
    }
    // 6. /help
    else if (commandName === 'help') {
        const embed = new EmbedBuilder().setColor(0x0099FF).setTitle('📜 Danh sách 20 lệnh của Bot')
            .setDescription(`
**👑 Lệnh Admin (Quản trị viên):**
1. \`/treo <id>\` - Treo phòng Voice 24/7
2. \`/thoat\` - Rời phòng Voice
3. \`/say <nội dung>\` - Gửi tin nhắn bằng bot
4. \`/restart\` - Khởi động lại bot từ xa

**🛠️ Tiện ích & Trạng thái:**
5. \`/status\` - Xem phòng treo & RAM
6. \`/help\` - Danh sách lệnh
7. \`/ping\` - Kiểm tra độ trễ
8. \`/uptime\` - Thời gian bot online
9. \`/botinfo\` - Thông tin bot
10. \`/serverinfo\` - Thông tin Server
11. \`/userinfo\` - Thông tin cá nhân
12. \`/avatar\` - Xem avatar bot

**🎲 Giải trí & Tương tác:**
13. \`/roll\` - Tung xúc xắc
14. \`/coinflip\` - Tung đồng xu
15. \`/calc <phép tính>\` - Tính toán
16. \`/choose <các lựa chọn>\` - Chọn ngẫu nhiên
17. \`/8ball <câu hỏi>\` - Bói toán vui
18. \`/rate <thứ cần chấm>\` - Chấm điểm vui
19. \`/hug <user>\` - Ôm người dùng
20. \`/poke <user>\` - Chọc ghẹo người dùng
            `);
        await interaction.reply({ embeds: [embed] });
    }
    // 7. /ping
    else if (commandName === 'ping') {
        const sent = await interaction.reply({ content: '🏓 Đang đo...', fetchReply: true });
        await interaction.editReply(`🏓 Phản hồi: \`${sent.createdTimestamp - interaction.createdTimestamp}ms\` | WebSocket: \`${Math.round(client.ws.ping)}ms\``);
    }
    // 8. /uptime
    else if (commandName === 'uptime') {
        const s = Math.floor(client.uptime / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        await interaction.reply(`⏱️ Bot đã hoạt động: \`${h} giờ ${m} phút ${s % 60} giây\``);
    }
    // 9. /botinfo
    else if (commandName === 'botinfo') {
        await interaction.reply('🤖 Bot Treo Voice 24/7 siêu nhẹ, hosted 24/7 trên Render!');
    }
    // 10. /serverinfo
    else if (commandName === 'serverinfo') {
        const owner = await interaction.guild.fetchOwner();
        const embed = new EmbedBuilder().setColor(0xFFD700).setTitle(`🏰 ${interaction.guild.name}`)
            .addFields({ name: '👥 Thành viên', value: `${interaction.guild.memberCount}`, inline: true }, { name: '👑 Chủ Server', value: `${owner.user.tag}`, inline: true });
        await interaction.reply({ embeds: [embed] });
    }
    // 11. /userinfo
    else if (commandName === 'userinfo') {
        const embed = new EmbedBuilder().setColor(0xF0E68C).setTitle(`👤 ${user.tag}`)
            .addFields({ name: '🆔 ID', value: `\`${user.id}\``, inline: true });
        await interaction.reply({ embeds: [embed] });
    }
    // 12. /avatar
    else if (commandName === 'avatar') {
        const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`🖼️ Avatar Bot`).setImage(client.user.displayAvatarURL({ size: 1024 }));
        await interaction.reply({ embeds: [embed] });
    }
    // 13. /roll
    else if (commandName === 'roll') {
        await interaction.reply(`🎲 Số ngẫu nhiên: **${Math.floor(Math.random() * 6) + 1}**`);
    }
    // 14. /coinflip
    else if (commandName === 'coinflip') {
        await interaction.reply(`🪙 Kết quả: **${Math.random() < 0.5 ? 'Sấp' : 'Ngửa'}**`);
    }
    // 15. /calc
    else if (commandName === 'calc') {
        const expr = interaction.options.getString('expression');
        try {
            const result = Function(`'use strict'; return (${expr})`)();
            await interaction.reply(`🔢 Kết quả: \`${expr} = ${result}\``);
        } catch {
            await interaction.reply({ content: '❌ Biểu thức không hợp lệ!', ephemeral: true });
        }
    }
    // 16. /choose
    else if (commandName === 'choose') {
        const list = interaction.options.getString('options').split(',');
        const choice = list[Math.floor(Math.random() * list.length)].trim();
        await interaction.reply(`🎯 Lựa chọn của bot: **${choice}**`);
    }
    // 17. /8ball
    else if (commandName === '8ball') {
        const ans = ['Chắc chắn rồi!', 'Khả năng cao.', 'Hỏi lại sau.', 'Không thể.', 'Rất có thể!'];
        await interaction.reply(`🔮 Trả lời: **${ans[Math.floor(Math.random() * ans.length)]}**`);
    }
    // 18. /rate
    else if (commandName === 'rate') {
        const thing = interaction.options.getString('thing');
        await interaction.reply(`⭐ Đánh giá **${thing}**: **${Math.floor(Math.random() * 10) + 1}/10** điểm!`);
    }
    // 19. /hug
    else if (commandName === 'hug') {
        await interaction.reply(`🤗 ${user} vừa ôm ${interaction.options.getUser('user')} thật ấm áp!`);
    }
    // 20. /poke
    else if (commandName === 'poke') {
        await interaction.reply(`👉 ${user} chọc ${interaction.options.getUser('user')} một cái!`);
    }
});

client.login(TOKEN);
