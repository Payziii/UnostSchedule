const { InputFile } = require('grammy');
const { saveUser } = require('../db');
const { getWeekImage, getTodayImage, getTomorrowImage, getTodayDayName } = require('../api');
const { isAdmin, GROUPS_CONFIG, daysOfWeek } = require('../config');
const { groupKeyboard } = require('../keyboards');
const { broadcastState } = require('../broadcast');

const registerCallbacks = (bot) => {

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // --- Выбор курса ---
    if (data.startsWith('course_')) {
      const course = data.replace('course_', '');
      if (!GROUPS_CONFIG[course]) return ctx.answerCallbackQuery('❌ Курс не найден.');
      await ctx.editMessageText(`📖 Теперь выберите группу:`, {
        parse_mode: 'Markdown',
        reply_markup: groupKeyboard(course),
      });
      return ctx.answerCallbackQuery();
    }

    // --- Выбор группы ---
    if (data.startsWith('group_')) {
      const [, course, group] = data.split('_');
      await saveUser(userId, course, group);
      await ctx.editMessageText(
        `Отлично! Ваша группа: *${group}*\n\n` +
        `Используйте:\n/today — сегодня\n/tomorrow — завтра\n/week — неделя`,
        { parse_mode: 'Markdown' }
      );
      return ctx.answerCallbackQuery('✅ Группа сохранена!');
    }

    // --- Инлайн: неделя ---
    if (data.startsWith('show_week_')) {
      const group = data.substring(10);
      try {
        const buffer = await getWeekImage(group);
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'week_schedule.png'),
          caption: `Расписание на неделю для ${group}`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        const text = err.message.includes('Расписание не найдено')
          ? '📅 Расписание не найдено.'
          : '❌ Ошибка API или сети.';
        await ctx.answerCallbackQuery({ text, show_alert: true });
      }
      return ctx.answerCallbackQuery();
    }

    // --- Инлайн: сегодня ---
    if (data.startsWith('show_today_')) {
      const group = data.substring(11);
      try {
        const buffer = await getTodayImage(group);
        const day = getTodayDayName();
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'schedule.png'),
          caption: `Расписание на сегодня — ${day} для ${group}`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        const text = err.message.includes('Расписание не найдено')
          ? '📅 Расписание не найдено.'
          : '❌ Ошибка API или сети.';
        await ctx.answerCallbackQuery({ text, show_alert: true });
      }
      return ctx.answerCallbackQuery();
    }

    // --- Инлайн: завтра ---
    if (data.startsWith('show_tomorrow_')) {
      const group = data.substring(14);
      try {
        const buffer = await getTomorrowImage(group);
        const now = new Date();
        now.setDate(now.getDate() + 1);
        const day = new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Asia/Yekaterinburg',
          weekday: 'long',
        }).format(now).toUpperCase();
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'schedule.png'),
          caption: `Расписание на завтра — ${day} для ${group}`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        const text = err.message.includes('Расписание не найдено')
          ? '📅 Расписание не найдено.'
          : '❌ Ошибка API или сети.';
        await ctx.answerCallbackQuery({ text, show_alert: true });
      }
      return ctx.answerCallbackQuery();
    }

    // --- Далее только для админов ---
    if (!isAdmin(userId)) {
      return ctx.answerCallbackQuery({ text: 'Недостаточно прав.', show_alert: true });
    }

    const state = broadcastState.get(userId);
    if (!state && data.startsWith('bc_')) {
      return ctx.answerCallbackQuery({ text: 'Сессия не найдена. Введите /broadcast', show_alert: true });
    }

    if (data === 'bc_cancel') {
      broadcastState.delete(userId);
      await ctx.editMessageText('Рассылка отменена.');
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_all') {
      Object.assign(state, { mode: 'all', filter: {}, stage: 'await_text' });
      broadcastState.set(userId, state);
      await ctx.editMessageText('Аудитория: *все пользователи*.\n\nОтправьте текст рассылки.', { parse_mode: 'Markdown' });
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_course') {
      Object.assign(state, { mode: 'course', stage: 'await_course' });
      broadcastState.set(userId, state);
      await ctx.editMessageText('Аудитория: *по курсу*.\n\nНапишите название курса.', { parse_mode: 'Markdown' });
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_group') {
      Object.assign(state, { mode: 'group', stage: 'await_group' });
      broadcastState.set(userId, state);
      await ctx.editMessageText('Аудитория: *по группе*.\n\nНапишите название группы.', { parse_mode: 'Markdown' });
      return ctx.answerCallbackQuery();
    }
  });

};

module.exports = { registerCallbacks };
