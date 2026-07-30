const { InputFile } = require('grammy');
const { getUser, deleteUser, getStats } = require('../db');
const { getTodayImage, getTomorrowImage, getWeekImage, getQueryImage, getRaspImage, getTodayDayName } = require('../api');
const { daysOfWeek, isAdmin, API_BASE_URL, GRADUATED_COURSE, GRADUATED_YEARS, isGraduated, graduatedLabel } = require('../config');
const { courseKeyboard } = require('../keyboards');
const { broadcastState } = require('../broadcast');
const { InlineKeyboard } = require('grammy');

const graduatedNotice = (year) =>
  `🎓 Вы выпустились в ${year} году.\nЧтобы выбрать группу заново — /restart`;

const graduateState = new Map();

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
        const label = isGraduated(user.course) ? graduatedLabel(user.group_name) : user.group_name;
        await ctx.reply(
          `Ваша группа: *${label}*\n\nЧтобы сменить — используйте /restart`,
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
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

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
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

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
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

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
      const graduatedTotal = byCourse
        .filter(r => isGraduated(r.course))
        .reduce((sum, r) => sum + r.count, 0);

      let message = `*Статистика бота*\n\n👥 Всего: *${total}*\n🎓 Выпустившихся: *${graduatedTotal}*\n\n`;
      if (byCourse.length) {
        message += `*По курсам:*\n`;
        byCourse.forEach(r => {
          const label = isGraduated(r.course) ? 'Выпустившиеся' : r.course;
          message += `• ${label}: *${r.count}*\n`;
        });
        message += `\n`;
      }
      if (byGroup.length) {
        message += `*Топ групп:*\n`;
        byGroup.forEach(r => {
          const label = isGraduated(r.course) ? graduatedLabel(r.group_name) : r.group_name;
          message += `• ${label}: *${r.count}*\n`;
        });
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
      const groupLabel = isGraduated(user.course) ? graduatedLabel(user.group_name) : user.group_name;
      await ctx.reply(
        `Пользователь *${args[1]}*\nКурс: *${user.course}*\nГруппа: *${groupLabel}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply('Ошибка при поиске.');
    }
  });

  bot.command('graduate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Доступ запрещён.');

    const year = (typeof ctx.match === 'string' ? ctx.match.trim() : '') || GRADUATED_YEARS[GRADUATED_YEARS.length - 1];
    if (!year) return ctx.reply('❌ В groups.json не задан ни один год выпуска.');
    if (!GRADUATED_YEARS.includes(year)) {
      return ctx.reply(
        `❌ Год *${year}* не найден в groups.json.\nДоступные: ${GRADUATED_YEARS.join(', ')}`,
        { parse_mode: 'Markdown' }
      );
    }

    graduateState.set(ctx.from.id, { year });
    const keyboard = new InlineKeyboard()
      .text('Весь курс', 'grad_mode_course').row()
      .text('Одну группу', 'grad_mode_group').row()
      .text('Отмена', 'grad_cancel');
    await ctx.reply(
      `🎓 Выпуск *${year}* года.\n\nКого переводим?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Доступ запрещён.');
    broadcastState.set(ctx.from.id, { stage: 'choose_target', mode: null, filter: {} });
    const keyboard = new InlineKeyboard()
      .text('Всем', 'bc_all').row()
      .text('По курсу', 'bc_course').row()
      .text('По группе', 'bc_group').row()
      .text('Выпустившимся', 'bc_graduated').row()
      .text('Отмена', 'bc_cancel');
    await ctx.reply('Выберите аудиторию для рассылки:', { reply_markup: keyboard });
  });

};

module.exports = { registerCommands, graduateState };
