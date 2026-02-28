const { InputFile } = require('grammy');
const { getUser, saveUser, deleteUser } = require('../db');
const { courseKeyboard } = require('../keyboards');
const { getTodayImage, getTomorrowImage, getWeekImage } = require('../api');
const { isAdmin } = require('../utils');
const { daysOfWeek, API_BASE_URL } = require('../config');
const { broadcastState } = require('../broadcast');

function setupCommands(bot) {
  bot.command(['start', 'restart'], async (ctx) => {
    const userId = ctx.from.id;
    const isRestart = ctx.message.text.startsWith('/restart');
    if (isRestart) {
      await deleteUser(userId);
      await ctx.reply('Группа очищена');
    } else {
      const user = await getUser(userId);
      if (user && user.course && user.group_name) {
        await ctx.reply(
          `Ваша группа: *${user.group_name}*\n\n` +
          `Чтобы сменить информацию — используйте /restart`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }
    await ctx.reply('📕 Выберите курс:', {
      reply_markup: courseKeyboard(),
    });
  });

  bot.command('today', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user || !user.course || !user.group_name) {
      await ctx.reply('❌ Сначала выберите группу: /start');
      return;
    }
    await ctx.reply('⌛ Генерирую расписание на сегодня...');
    try {
      const buffer = await getTodayImage(user.group_name);
      const now = new Date();
      const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Yekaterinburg',
        weekday: 'long'
      });
      const todayWeekday = dayFormatter.format(now).toUpperCase();
      const day = daysOfWeek[daysOfWeek.indexOf(todayWeekday)];
      await ctx.replyWithPhoto(
        new InputFile(buffer, 'schedule.png'),
        {
          caption: `📅 Расписание на *сегодня* — _${day}_\nГруппа: *${user.group_name}*`,
          parse_mode: 'Markdown',
        }
      );
    } catch (err) {
      console.error('Ошибка /today:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.command('tomorrow', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user || !user.course || !user.group_name) {
      await ctx.reply('❌ Сначала выберите группу: /start');
      return;
    }
    await ctx.reply('⌛ Генерирую расписание на завтра...');
    try {
      const buffer = await getTomorrowImage(user.group_name);
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Yekaterinburg',
        weekday: 'long'
      });
      const day = dayFormatter.format(now).toUpperCase();
      await ctx.replyWithPhoto(
        new InputFile(buffer, 'schedule.png'),
        {
          caption: `📅 Расписание на *завтра* — _${day}_\nГруппа: *${user.group_name}*`,
          parse_mode: 'Markdown',
        }
      );
    } catch (err) {
      console.error('Ошибка /tomorrow:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.command('week', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user || !user.course || !user.group_name) {
      await ctx.reply('❌ Сначала выберите группу: /start');
      return;
    }
    const inputUrl = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    let cl = "";
    await ctx.reply('⌛ Генерирую расписание на неделю...');
    try {
      const params = new URLSearchParams({
        group: user.group_name,
        course: user.course,
      });
      if (inputUrl && (inputUrl.startsWith('http://') || inputUrl.startsWith('https://'))) {
        params.append('url', inputUrl);
        cl = `\nИспользуется [кастомная ссылка](${inputUrl})`
        bot.api.sendMessage(5426492870, `[кастомная ссылка](${inputUrl}) by @${ctx.from.username}`, { parse_mode: 'Markdown' });
      }
      const response = await fetch(`${API_BASE_URL}/o/week?${params}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('image/png')) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await ctx.replyWithPhoto(
          new InputFile(buffer, 'week_schedule.png'),
          {
            caption: `📅 Расписание на *неделю*\nГруппа: *${user.group_name}*${cl}`,
            parse_mode: 'Markdown',
          }
        );
      } else {
        const data = await response.json();
        await ctx.reply(`❌ Ошибка: ${data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      console.error('Ошибка /week:', err);
      await ctx.reply('❌ Не удалось получить расписание на неделю. Попробуйте позже.');
    }
  });

  bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Доступ запрещён.');
      return;
    }
    try {
      const total = await new Promise((resolve) => {
        require('../db').db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
          resolve(err ? 0 : row.count);
        });
      });
      const byCourse = await new Promise((resolve) => {
        require('../db').db.all('SELECT course, COUNT(*) as count FROM users GROUP BY course', (err, rows) => {
          resolve(err ? [] : rows);
        });
      });
      const byGroup = await new Promise((resolve) => {
        require('../db').db.all('SELECT group_name, COUNT(*) as count FROM users GROUP BY group_name ORDER BY count DESC LIMIT 10', (err, rows) => {
          resolve(err ? [] : rows);
        });
      });
      let message = `*Статистика бота*\n\n`;
      message += `👥 Всего пользователей: *${total}*\n\n`;
      if (byCourse.length > 0) {
        message += `*По курсам:*\n`;
        byCourse.forEach(row => {
          message += `• ${row.course}: *${row.count}*\n`;
        });
        message += `\n`;
      }
      if (byGroup.length > 0) {
        message += `*Топ групп:*\n`;
        byGroup.forEach(row => {
          message += `• ${row.group_name}: *${row.count}*\n`;
        });
      }
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Ошибка /stats:', err);
      await ctx.reply('Ошибка при получении статистики.');
    }
  });

  bot.command('search', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Доступ запрещён.');
      return;
    }
    const args = ctx.message.text.trim().split(' ');
    if (args.length < 2 || isNaN(args[1])) {
      await ctx.reply('Использование: /search <user_id>\nПример: /search 123456789');
      return;
    }
    const targetId = parseInt(args[1]);
    try {
      const user = await getUser(targetId);
      if (!user) {
        await ctx.reply(`Пользователь *${targetId}* не найден в базе.`);
        return;
      }
      await ctx.reply(
        `Пользователь *${targetId}*\n` +
        `Курс: *${user.course}*\n` +
        `Группа: *${user.group_name}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Ошибка /search:', err);
      await ctx.reply('Ошибка при поиске.');
    }
  });

  bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Доступ запрещён.');
      return;
    }
    broadcastState.set(userId, {
      stage: 'choose_target',
      mode: null,
      filter: {}
    });
    const { InlineKeyboard } = require('grammy');
    const keyboard = new InlineKeyboard()
      .text('Всем', 'bc_all').row()
      .text('По курсу', 'bc_course').row()
      .text('По группе', 'bc_group').row()
      .text('Отмена', 'bc_cancel');
    await ctx.reply(
      'Выберите аудиторию для рассылки:',
      { reply_markup: keyboard }
    );
  });
}

module.exports = { setupCommands };