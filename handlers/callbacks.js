const { InputFile, InlineKeyboard } = require('grammy');
const { saveUser, graduateCourse, graduateGroup, promoteGroup } = require('../db');
const { getWeekImage, getTodayImage, getTomorrowImage, getTodayDayName } = require('../api');
const { isAdmin, GROUPS_CONFIG, daysOfWeek, GRADUATED_COURSE, graduatedLabel } = require('../config');
const { groupKeyboard, gradCourseKeyboard, gradGroupKeyboard } = require('../keyboards');
const { broadcastState } = require('../broadcast');
const { graduateState, promoteState } = require('./commands');

const gradConfirmKeyboard = () => new InlineKeyboard()
  .text('Подтвердить', 'grad_confirm').row()
  .text('Отмена', 'grad_cancel');

const registerCallbacks = (bot) => {

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // --- Выбор курса ---
    if (data.startsWith('course_')) {
      const course = data.replace('course_', '');
      if (!GROUPS_CONFIG[course] || course === GRADUATED_COURSE) return ctx.answerCallbackQuery('❌ Курс не найден.');
      await ctx.editMessageText(`📖 Теперь выберите группу:`, {
        parse_mode: 'Markdown',
        reply_markup: groupKeyboard(course),
      });
      return ctx.answerCallbackQuery();
    }

    // --- Выбор группы ---
    if (data.startsWith('group_')) {
      const [, course, group] = data.split('_');
      if (course === GRADUATED_COURSE) return ctx.answerCallbackQuery('❌ Группа не найдена.');
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

    // --- Перевод в выпустившиеся ---
    if (data === 'grad_cancel') {
      graduateState.delete(userId);
      await ctx.editMessageText('Перевод отменён.');
      return ctx.answerCallbackQuery();
    }

    if (data.startsWith('grad_')) {
      const grad = graduateState.get(userId);
      if (!grad) {
        return ctx.answerCallbackQuery({ text: 'Сессия не найдена. Введите /graduate', show_alert: true });
      }

      if (data === 'grad_mode_course' || data === 'grad_mode_group') {
        grad.mode = data === 'grad_mode_course' ? 'course' : 'group';
        graduateState.set(userId, grad);
        await ctx.editMessageText(
          grad.mode === 'course'
            ? '🎓 Выберите курс — будут переведены *все* его группы:'
            : '🎓 Выберите курс выпускающейся группы:',
          { parse_mode: 'Markdown', reply_markup: gradCourseKeyboard() }
        );
        return ctx.answerCallbackQuery();
      }

      if (data.startsWith('grad_course_')) {
        const course = data.replace('grad_course_', '');
        if (!GROUPS_CONFIG[course] || course === GRADUATED_COURSE) {
          return ctx.answerCallbackQuery({ text: 'Курс не найден.', show_alert: true });
        }
        grad.course = course;
        graduateState.set(userId, grad);

        if (grad.mode === 'group') {
          await ctx.editMessageText(`🎓 Выберите группу *${course}* курса:`, {
            parse_mode: 'Markdown',
            reply_markup: gradGroupKeyboard(course),
          });
          return ctx.answerCallbackQuery();
        }

        await ctx.editMessageText(
          `🎓 Перевести *весь ${course} курс* (${GROUPS_CONFIG[course].length} групп) в *${graduatedLabel(grad.year)}*?\n\nЭто действие необратимо.`,
          { parse_mode: 'Markdown', reply_markup: gradConfirmKeyboard() }
        );
        return ctx.answerCallbackQuery();
      }

      if (data.startsWith('grad_group_')) {
        const [course, index] = data.replace('grad_group_', '').split('_');
        const group = GROUPS_CONFIG[course]?.[Number(index)];
        if (!group) return ctx.answerCallbackQuery({ text: 'Группа не найдена.', show_alert: true });

        grad.group = group;
        graduateState.set(userId, grad);
        await ctx.editMessageText(
          `🎓 Перевести группу *${group}* (${course} курс) в *${graduatedLabel(grad.year)}*?\n\nЭто действие необратимо.`,
          { parse_mode: 'Markdown', reply_markup: gradConfirmKeyboard() }
        );
        return ctx.answerCallbackQuery();
      }

      if (data === 'grad_confirm') {
        if (!grad.mode || !grad.course || (grad.mode === 'group' && !grad.group)) {
          return ctx.answerCallbackQuery({ text: 'Выбор не завершён. Введите /graduate', show_alert: true });
        }
        graduateState.delete(userId);

        try {
          const moved = grad.mode === 'group'
            ? await graduateGroup(grad.group, GRADUATED_COURSE, grad.year)
            : await graduateCourse(grad.course, GRADUATED_COURSE, grad.year);
          const target = grad.mode === 'group' ? `группа *${grad.group}*` : `весь *${grad.course} курс*`;
          await ctx.editMessageText(
            `🎓 Переведено пользователей: *${moved}*\nКого: ${target}\nНовый статус: *${graduatedLabel(grad.year)}*`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.error('Ошибка /graduate:', err);
          await ctx.editMessageText('❌ Ошибка при переводе пользователей.');
        }
        return ctx.answerCallbackQuery();
      }
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

    if (data === 'bc_graduated') {
      Object.assign(state, { mode: 'graduated', filter: { course: GRADUATED_COURSE }, stage: 'await_text' });
      broadcastState.set(userId, state);
      await ctx.editMessageText('Аудитория: *выпустившиеся*.\n\nОтправьте текст рассылки.', { parse_mode: 'Markdown' });
      return ctx.answerCallbackQuery();
    }

    // --- Перевод группы на следующий курс ---
    if (data === 'promo_cancel') {
      promoteState.delete(userId);
      await ctx.editMessageText('Перевод отменён.');
      return ctx.answerCallbackQuery();
    }

    if (data === 'promo_confirm') {
      const promo = promoteState.get(userId);
      if (!promo || !promo.fromGroup || !promo.toCourse || !promo.toGroup) {
        return ctx.answerCallbackQuery({ text: 'Сессия не найдена. Введите /promote', show_alert: true });
      }
      promoteState.delete(userId);

      try {
        const moved = await promoteGroup(promo.fromGroup, promo.toCourse, promo.toGroup);
        await ctx.editMessageText(
          `📚 Переведено пользователей: *${moved}*\nИз группы: *${promo.fromGroup}*\nВ группу: *${promo.toGroup}* (${promo.toCourse} курс)`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error('Ошибка /promote:', err);
        await ctx.editMessageText('❌ Ошибка при переводе пользователей.');
      }
      return ctx.answerCallbackQuery();
    }
  });

};

module.exports = { registerCallbacks };
