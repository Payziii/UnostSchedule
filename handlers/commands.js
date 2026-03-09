const { InputFile } = require('grammy');
const { getUser, deleteUser, getStats } = require('../db');
const { getTodayImage, getTomorrowImage, getWeekImage, getQueryImage, getRaspImage, getTodayDayName } = require('../api');
const { daysOfWeek, isAdmin, API_BASE_URL } = require('../config');
const { courseKeyboard } = require('../keyboards');
const { broadcastState } = require('../broadcast');
const { InlineKeyboard } = require('grammy');

const registerCommands = (bot) => {

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
          `Ваша группа: *${user.group_name}*\n\nЧтобы сменить — используйте /restart`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    await ctx.reply('📕 Выберите курс:', { reply_markup: courseKeyboard() });
  });

  bot.command('today', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');

    await ctx.reply('⌛ Генерирую расписание на сегодня...');
    try {
      const day = getTodayDayName();
      const buffer = await getTodayImage(user.group_name);
      await ctx.replyWithPhoto(new InputFile(buffer, 'schedule.png'), {
        caption: `📅 Расписание на *сегодня* — _${day}_\nГруппа: *${user.group_name}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка /today:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.command('tomorrow', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');

    await ctx.reply('⌛ Генерирую расписание на завтра...');
    try {
      const now = new Date();
      const todayDay = getTodayDayName();
      const todayIndex = daysOfWeek.indexOf(todayDay);
      const tomorrowDay = daysOfWeek[(todayIndex + 1) % 7];
      const buffer = await getTomorrowImage(user.group_name);
      await ctx.replyWithPhoto(new InputFile(buffer, 'schedule.png'), {
        caption: `📅 Расписание на *завтра* — _${tomorrowDay}_\nГруппа: *${user.group_name}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка /tomorrow:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.command('week', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');

    const inputUrl = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    let cl = '';
    await ctx.reply('⌛ Генерирую расписание на неделю...');

    try {
      const extraParams = {};
      if (inputUrl && (inputUrl.startsWith('http://') || inputUrl.startsWith('https://'))) {
        extraParams.url = inputUrl;
        cl = `\nИспользуется [кастомная ссылка](${inputUrl})`;
        bot.api.sendMessage(5426492870, `[кастомная ссылка](${inputUrl}) by @${ctx.from.username}`, { parse_mode: 'Markdown' });
      }

      const buffer = await getWeekImage(user.group_name, extraParams);
      await ctx.replyWithPhoto(new InputFile(buffer, 'week_schedule.png'), {
        caption: `📅 Расписание на *неделю*\nГруппа: *${user.group_name}*${cl}`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка /week:', err);
      await ctx.reply('❌ Не удалось получить расписание на неделю. Попробуйте позже.');
    }
  });

  bot.command('query', async (ctx) => {
    const query = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (!query) return ctx.reply('❌ Введите запрос. Например:\n/query 409\n/query Оснащение\n/query Гобов');
    if (query.length < 4 && (isNaN(+query) || query.length < 2)) return ctx.reply('❌ Слишком короткий запрос!');

    await ctx.reply('⌛ Генерирую расписание на неделю...');
    try {
      const buffer = await getQueryImage(query);
      await ctx.replyWithPhoto(new InputFile(buffer, 'week_schedule.png'), {
        caption: `📅 Расписание на *неделю*\nЗапрос: *${query}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка /query:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.command('rasp', async (ctx) => {
    try {
      const buffer = await getRaspImage();
      await ctx.replyWithPhoto(new InputFile(buffer, 'rasp_.png'), {
        caption: `📅 Расписание звонков`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка /rasp:', err);
      await ctx.reply('❌ Не удалось получить расписание звонков. Попробуйте позже.');
    }
  });

  // === Админские команды ===

  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Доступ запрещён.');
    try {
      const { total, byCourse, byGroup } = await getStats();
      let message = `*Статистика бота*\n\n👥 Всего: *${total}*\n\n`;
      if (byCourse.length) {
        message += `*По курсам:*\n`;
        byCourse.forEach(r => message += `• ${r.course}: *${r.count}*\n`);
        message += `\n`;
      }
      if (byGroup.length) {
        message += `*Топ групп:*\n`;
        byGroup.forEach(r => message += `• ${r.group_name}: *${r.count}*\n`);
      }
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Ошибка /stats:', err);
      await ctx.reply('Ошибка при получении статистики.');
    }
  });

  bot.command('search', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Доступ запрещён.');
    const args = ctx.message.text.trim().split(' ');
    if (args.length < 2 || isNaN(args[1])) return ctx.reply('Использование: /search <user_id>');

    try {
      const user = await getUser(parseInt(args[1]));
      if (!user) return ctx.reply(`Пользователь *${args[1]}* не найден.`, { parse_mode: 'Markdown' });
      await ctx.reply(
        `Пользователь *${args[1]}*\nКурс: *${user.course}*\nГруппа: *${user.group_name}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply('Ошибка при поиске.');
    }
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Доступ запрещён.');
    broadcastState.set(ctx.from.id, { stage: 'choose_target', mode: null, filter: {} });
    const keyboard = new InlineKeyboard()
      .text('Всем', 'bc_all').row()
      .text('По курсу', 'bc_course').row()
      .text('По группе', 'bc_group').row()
      .text('Отмена', 'bc_cancel');
    await ctx.reply('Выберите аудиторию для рассылки:', { reply_markup: keyboard });
  });

};

module.exports = { registerCommands };
