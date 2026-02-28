const { InputFile } = require('grammy');
const { saveUser } = require('../db');
const { groupKeyboard } = require('../keyboards');
const { getWeekImage, getTodayImage, getTomorrowImage } = require('../api');
const { isAdmin } = require('../utils');
const { GROUPS_CONFIG, daysOfWeek } = require('../config');
const { broadcastState } = require('../broadcast');

function setupCallbacks(bot) {
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // Выбор курса
    if (data.startsWith('course_')) {
      const course = data.replace('course_', '');
      if (!GROUPS_CONFIG[course]) {
        await ctx.answerCallbackQuery('❌ Ошибка: курс не найден.');
        return;
      }
      await ctx.editMessageText(`📖 Теперь выберите группу:`, {
        parse_mode: 'Markdown',
        reply_markup: groupKeyboard(course),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // Выбор группы
    if (data.startsWith('group_')) {
      const [, course, group] = data.split('_');
      await saveUser(userId, course, group);
      await ctx.editMessageText(
        `Отлично! Ваша группа: *${group}*\n\n` +
        `Теперь используйте:\n/today - расписание на сегодня\n/tomorrow — расписание на завтра\n/week — на неделю`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCallbackQuery('✅ Группа сохранена!');
      return;
    }

    // Показ расписания на неделю
    if (data.startsWith('show_week_')) {
      const group = data.substring(10);
      try {
        const buffer = await getWeekImage(group);
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'week_schedule.png'),
          caption: `Расписание на неделю для ${group}`,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        if (err.message.includes('Расписание не найдено')) {
          await ctx.answerCallbackQuery({
            text: '📅 Расписание на неделю не найдено.',
            show_alert: true
          });
        } else {
          await ctx.answerCallbackQuery({
            text: '❌ Ошибка API или сети.',
            show_alert: false
          });
        }
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Показ расписания на сегодня
    if (data.startsWith('show_today_')) {
      const group = data.substring(11);
      try {
        const buffer = await getTodayImage(group);
        const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Asia/Yekaterinburg',
          weekday: 'long'
        });
        const day = dayFormatter.format(new Date()).toUpperCase();
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'schedule.png'),
          caption: `Расписание на сегодня — ${day} для ${group}`,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        if (err.message.includes('Расписание не найдено')) {
          await ctx.answerCallbackQuery({
            text: '📅 Расписание на сегодня не найдено.',
            show_alert: true
          });
        } else {
          await ctx.answerCallbackQuery({
            text: '❌ Ошибка API или сети.',
            show_alert: false
          });
        }
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Показ расписания на завтра
    if (data.startsWith('show_tomorrow_')) {
      const group = data.substring(14);
      try {
        const buffer = await getTomorrowImage(group);
        const now = new Date();
        now.setDate(now.getDate() + 1);
        const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Asia/Yekaterinburg',
          weekday: 'long'
        });
        const day = dayFormatter.format(now).toUpperCase();
        await ctx.editMessageMedia({
          type: 'photo',
          media: new InputFile(buffer, 'schedule.png'),
          caption: `Расписание на завтра — ${day} для ${group}`,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        if (err.message.includes('Расписание не найдено')) {
          await ctx.answerCallbackQuery({
            text: '📅 Расписание на завтра не найдено.',
            show_alert: true
          });
        } else {
          await ctx.answerCallbackQuery({
            text: '❌ Ошибка API или сети.',
            show_alert: false
          });
        }
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Админские действия
    if (!isAdmin(userId)) {
      await ctx.answerCallbackQuery({
        text: 'Недостаточно прав.',
        show_alert: true
      });
      return;
    }

    const state = broadcastState.get(userId);
    if (!state && data.startsWith('bc_')) {
      await ctx.answerCallbackQuery({
        text: 'Сессия рассылки не найдена. Введите /broadcast',
        show_alert: true
      });
      return;
    }

    if (data === 'bc_cancel') {
      broadcastState.delete(userId);
      await ctx.editMessageText('Рассылка отменена.');
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'bc_all') {
      state.mode = 'all';
      state.filter = {};
      state.stage = 'await_text';
      broadcastState.set(userId, state);
      await ctx.editMessageText('Аудитория: *все пользователи*.\n\nОтправьте текст рассылки одним сообщением.',
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'bc_course') {
      state.mode = 'course';
      state.stage = 'await_course';
      broadcastState.set(userId, state);
      await ctx.editMessageText(
        'Аудитория: *по курсу*.\n\nНапишите в ответ номер/название курса **точно так же, как он сохранён в БД**.',
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'bc_group') {
      state.mode = 'group';
      state.stage = 'await_group';
      broadcastState.set(userId, state);
      await ctx.editMessageText(
        'Аудитория: *по группе*.\n\nНапишите в ответ название группы **точно так же, как в БД**.',
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCallbackQuery();
      return;
    }
  });
}

module.exports = { setupCallbacks };