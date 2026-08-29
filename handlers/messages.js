const { isAdmin, daysOfWeek, isGraduated, graduatedLabel } = require('../config');
const { broadcastState, runBroadcast } = require('../broadcast');
const { getUser, countUsersByFilter } = require('../db');
const { getTodayImage, getTomorrowImage, getWeekImage, getTodayDayName } = require('../api');
const { InputFile, InlineKeyboard } = require('grammy');
const { mainKeyboard } = require('../keyboards');

const graduatedNotice = (year) =>
  `🎓 Вы выпустились в ${year} году.\nЧтобы выбрать группу заново — /restart`;

const registerMessages = (bot) => {

  bot.hears('🗓️ Сегодня', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

    await ctx.reply('⌛ Генерирую расписание на сегодня...', { reply_markup: mainKeyboard() });
    try {
      const day = getTodayDayName();
      const buffer = await getTodayImage(user.group_name);
      await ctx.replyWithPhoto(new InputFile(buffer, 'schedule.png'), {
        caption: `📅 Расписание на *сегодня* — _${day}_\nГруппа: *${user.group_name}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка кнопки Сегодня:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.hears('🗓️ Завтра', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

    await ctx.reply('⌛ Генерирую расписание на завтра...', { reply_markup: mainKeyboard() });
    try {
      const todayDay = getTodayDayName();
      const todayIndex = daysOfWeek.indexOf(todayDay);
      const tomorrowDay = daysOfWeek[(todayIndex + 1) % 7];
      const buffer = await getTomorrowImage(user.group_name);
      await ctx.replyWithPhoto(new InputFile(buffer, 'schedule.png'), {
        caption: `📅 Расписание на *завтра* — _${tomorrowDay}_\nГруппа: *${user.group_name}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка кнопки Завтра:', err);
      await ctx.reply('❌ Не удалось получить расписание. Попробуйте позже.');
    }
  });

  bot.hears('🗓️ Неделя', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start');
    if (isGraduated(user.course)) return ctx.reply(graduatedNotice(user.group_name));

    await ctx.reply('⌛ Генерирую расписание на неделю...', { reply_markup: mainKeyboard() });
    try {
      const buffer = await getWeekImage(user.group_name, {});
      await ctx.replyWithPhoto(new InputFile(buffer, 'week_schedule.png'), {
        caption: `📅 Расписание на *неделю*\nГруппа: *${user.group_name}*`,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error('Ошибка кнопки Неделя:', err);
      await ctx.reply('❌ Не удалось получить расписание на неделю. Попробуйте позже.');
    }
  });

  bot.hears('👤 Профиль', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user?.course) return ctx.reply('❌ Сначала выберите группу: /start', { reply_markup: mainKeyboard() });

    const label = isGraduated(user.course) ? graduatedLabel(user.group_name) : user.group_name;

    const keyboard = new InlineKeyboard()
      .text('⚙️ Настройки', 'profile_settings').row()
      .text('🔄 Сменить группу', 'profile_restart');

    await ctx.reply(
      `👤 *Ваш профиль*\n\nГруппа: *${label}*\nКурс: *${user.course}*`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.hears('📊 Инфо', async (ctx) => {
    try {
      const { getStats } = require('../db');
      const { total, byCourse } = await getStats();

      // Фильтруем выпустившихся
      const activeCourses = byCourse.filter(r => !isGraduated(r.course));
      const graduatedCount = byCourse
        .filter(r => isGraduated(r.course))
        .reduce((sum, r) => sum + r.count, 0);
      const activeTotal = total - graduatedCount;

      let statsText = '';
      if (activeCourses.length) {
        statsText = '\n\n*Статистика по курсам:*\n';
        activeCourses.forEach(r => {
          statsText += `• ${r.course}: ${r.count}\n`;
        });
      }

      const message =
        `📊 *Информация о боте*\n` +
        `\n👥 Всего пользователей: *${activeTotal}*` +
        statsText +
        `\n🔗 *Ссылки:*\n` +
        `• [Репозиторий GitHub](https://github.com/Payziii/UnostSchedule)\n` +
        `• [Сайт расписания](https://u.fifty.chat/)\n` +
        `• [Политика использования](https://github.com/Payziii/UnostSchedule/blob/main/TERMS.md)`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard(),
        link_preview_options: { is_disabled: true }
      });
    } catch (err) {
      console.error('Ошибка кнопки Инфо:', err);
      await ctx.reply('❌ Не удалось получить информацию. Попробуйте позже.', { reply_markup: mainKeyboard() });
    }
  });

  bot.on('message', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (!isAdmin(userId)) return;

    const state = broadcastState.get(userId);
    if (!state) return;

    if (state.stage === 'await_course') {
      state.filter = { course: text.trim() };
      state.stage = 'await_text';
      broadcastState.set(userId, state);

      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      const count = await countUsersByFilter(state.filter, notifType);

      return ctx.reply(
        `Курс: *${state.filter.course}*\nРассылку получат *${count}* пользователей\n\nОтправьте текст рассылки.`,
        { parse_mode: 'Markdown' }
      );
    }

    if (state.stage === 'await_group') {
      state.filter = { group_name: text.trim() };
      state.stage = 'await_text';
      broadcastState.set(userId, state);

      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      const count = await countUsersByFilter(state.filter, notifType);

      return ctx.reply(
        `Группа: *${state.filter.group_name}*\nРассылку получат *${count}* пользователей\n\nОтправьте текст рассылки.`,
        { parse_mode: 'Markdown' }
      );
    }

    if (state.stage === 'await_text') {
      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      runBroadcast(bot, userId, ctx.message.message_id, state.filter, notifType);
      broadcastState.delete(userId);
    }
  });

};

module.exports = { registerMessages };
