const { InputFile, InlineKeyboard } = require('grammy');
const { saveUser, graduateCourse, graduateGroup, promoteGroup, getUser, toggleNotification, deleteUser, countUsersByFilter } = require('../db');
const { getWeekImage, getTodayImage, getTomorrowImage, getTodayDayName } = require('../api');
const { isAdmin, GROUPS_CONFIG, daysOfWeek, GRADUATED_COURSE, graduatedLabel, isGraduated } = require('../config');
const { groupKeyboard, gradCourseKeyboard, gradGroupKeyboard, mainKeyboard, courseKeyboard } = require('../keyboards');
const { broadcastState } = require('../broadcast');
const { graduateState, promoteState } = require('./commands');

const gradConfirmKeyboard = () => new InlineKeyboard()
  .text('Подтвердить', 'grad_confirm').row()
  .text('Отмена', 'grad_cancel');

const settingsKeyboard = (user) => {
  const promoIcon = user.promo_notifications === 1 ? '✅' : '❌';
  const systemIcon = user.system_notifications === 1 ? '✅' : '❌';
  return new InlineKeyboard()
    .text(`${promoIcon} Рекламные увед.`, 'settings_promo').row()
    .text(`${systemIcon} Системные увед.`, 'settings_system').row()
    .text('◀️ Назад', 'settings_back');
};

const registerCallbacks = (bot) => {

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // --- Профиль: настройки ---
    if (data === 'profile_settings') {
      const user = await getUser(userId);
      if (!user) return ctx.answerCallbackQuery({ text: 'Профиль не найден', show_alert: true });

      await ctx.editMessageText(
        `⚙️ *Настройки уведомлений*\n\nВключите или отключите типы уведомлений:`,
        { parse_mode: 'Markdown', reply_markup: settingsKeyboard(user) }
      );
      return ctx.answerCallbackQuery();
    }

    // --- Профиль: сменить группу ---
    if (data === 'profile_restart') {
      await deleteUser(userId);
      await ctx.editMessageText('Группа очищена. Выберите новую группу:', {
        reply_markup: courseKeyboard()
      });
      return ctx.answerCallbackQuery('✅ Группа сброшена');
    }

    // --- Настройки: переключение уведомлений ---
    if (data === 'settings_promo' || data === 'settings_system') {
      const type = data === 'settings_promo' ? 'promo' : 'system';
      const newValue = await toggleNotification(userId, type);
      const user = await getUser(userId);

      const statusText = newValue === 1 ? 'включены' : 'отключены';
      const typeText = type === 'promo' ? 'Рекламные' : 'Системные';

      await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(user) });
      return ctx.answerCallbackQuery(`${typeText} уведомления ${statusText}`);
    }

    // --- Настройки: назад ---
    if (data === 'settings_back') {
      const user = await getUser(userId);
      if (!user?.course) return ctx.answerCallbackQuery({ text: 'Профиль не найден', show_alert: true });

      const label = isGraduated(user.course) ? graduatedLabel(user.group_name) : user.group_name;
      const keyboard = new InlineKeyboard()
        .text('⚙️ Настройки', 'profile_settings').row()
        .text('🔄 Сменить группу', 'profile_restart');

      await ctx.editMessageText(
        `👤 *Ваш профиль*\n\nГруппа: *${label}*\nКурс: *${user.course}*`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

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
      await ctx.reply('Используйте кнопки ниже для быстрого доступа:', { reply_markup: mainKeyboard() });
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

    // --- Broadcast: выбор типа ---
    if (data.startsWith('bc_type_')) {
      const state = broadcastState.get(userId);
      if (!state) return ctx.answerCallbackQuery({ text: 'Сессия не найдена. Введите /broadcast', show_alert: true });

      const typeMap = { 'bc_type_promo': 'promo', 'bc_type_system': 'system', 'bc_type_mandatory': 'mandatory' };
      const typeLabels = { 'promo': '📢 Рекламная', 'system': '⚙️ Системная', 'mandatory': '🔔 Обязательная' };
      const type = typeMap[data];

      state.notificationType = type;
      state.stage = 'choose_target';
      broadcastState.set(userId, state);

      const count = await countUsersByFilter({}, type === 'mandatory' ? null : type);
      const keyboard = new InlineKeyboard()
        .text('Всем', 'bc_all').row()
        .text('По курсу', 'bc_course').row()
        .text('По группе', 'bc_group').row()
        .text('Выпустившимся', 'bc_graduated').row()
        .text('◀️ Назад', 'bc_back_type').row()
        .text('Отмена', 'bc_cancel');

      await ctx.editMessageText(
        `Тип рассылки: *${typeLabels[type]}*\n\nРассылку получат *${count}* пользователей\n\nВыберите аудиторию:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

    // --- Broadcast: вернуться к выбору типа ---
    if (data === 'bc_back_type') {
      const state = broadcastState.get(userId);
      if (!state) return ctx.answerCallbackQuery({ text: 'Сессия не найдена. Введите /broadcast', show_alert: true });

      state.stage = 'choose_type';
      state.notificationType = null;
      state.filter = {};
      broadcastState.set(userId, state);

      const keyboard = new InlineKeyboard()
        .text('📢 Рекламная', 'bc_type_promo').row()
        .text('⚙️ Системная', 'bc_type_system').row()
        .text('🔔 Обязательная', 'bc_type_mandatory').row()
        .text('Отмена', 'bc_cancel');

      await ctx.editMessageText('Выберите тип рассылки:', { reply_markup: keyboard });
      return ctx.answerCallbackQuery();
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
      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      const count = await countUsersByFilter({}, notifType);

      Object.assign(state, { mode: 'all', filter: {}, stage: 'await_text' });
      broadcastState.set(userId, state);

      await ctx.editMessageText(
        `Аудитория: *все пользователи*\nРассылку получат *${count}* пользователей\n\nОтправьте текст рассылки.`,
        { parse_mode: 'Markdown' }
      );
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_course') {
      Object.assign(state, { mode: 'course', stage: 'await_course' });
      broadcastState.set(userId, state);

      const keyboard = new InlineKeyboard().text('◀️ Назад', 'bc_back_target');
      await ctx.editMessageText('Аудитория: *по курсу*.\n\nНапишите название курса.', {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_group') {
      Object.assign(state, { mode: 'group', stage: 'await_group' });
      broadcastState.set(userId, state);

      const keyboard = new InlineKeyboard().text('◀️ Назад', 'bc_back_target');
      await ctx.editMessageText('Аудитория: *по группе*.\n\nНапишите название группы.', {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      return ctx.answerCallbackQuery();
    }

    if (data === 'bc_graduated') {
      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      const count = await countUsersByFilter({ course: GRADUATED_COURSE }, notifType);

      Object.assign(state, { mode: 'graduated', filter: { course: GRADUATED_COURSE }, stage: 'await_text' });
      broadcastState.set(userId, state);

      await ctx.editMessageText(
        `Аудитория: *выпустившиеся*\nРассылку получат *${count}* пользователей\n\nОтправьте текст рассылки.`,
        { parse_mode: 'Markdown' }
      );
      return ctx.answerCallbackQuery();
    }

    // --- Broadcast: вернуться к выбору аудитории ---
    if (data === 'bc_back_target') {
      state.stage = 'choose_target';
      state.filter = {};
      broadcastState.set(userId, state);

      const notifType = state.notificationType === 'mandatory' ? null : state.notificationType;
      const typeLabels = { 'promo': '📢 Рекламная', 'system': '⚙️ Системная', 'mandatory': '🔔 Обязательная' };
      const count = await countUsersByFilter({}, notifType);

      const keyboard = new InlineKeyboard()
        .text('Всем', 'bc_all').row()
        .text('По курсу', 'bc_course').row()
        .text('По группе', 'bc_group').row()
        .text('Выпустившимся', 'bc_graduated').row()
        .text('◀️ Назад', 'bc_back_type').row()
        .text('Отмена', 'bc_cancel');

      await ctx.editMessageText(
        `Тип рассылки: *${typeLabels[state.notificationType]}*\n\nРассылку получат *${count}* пользователей\n\nВыберите аудиторию:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

    // --- Перевод группы на следующий курс ---
    if (data === 'promo_cancel') {
      promoteState.delete(userId);
      await ctx.editMessageText('Перевод отменён.');
      return ctx.answerCallbackQuery();
    }

    if (data.startsWith('promo_from_')) {
      const fromCourse = data.replace('promo_from_', '');
      if (!GROUPS_CONFIG[fromCourse] || fromCourse === GRADUATED_COURSE) {
        return ctx.answerCallbackQuery({ text: 'Курс не найден.', show_alert: true });
      }

      const promo = promoteState.get(userId) || {};
      promo.fromCourse = fromCourse;
      promoteState.set(userId, promo);

      const keyboard = new InlineKeyboard();
      GROUPS_CONFIG[fromCourse].forEach((group, index) => {
        keyboard.text(group, `promo_group_${fromCourse}_${index}`).row();
      });
      keyboard.text('Отмена', 'promo_cancel');

      await ctx.editMessageText(
        `📚 Выберите группу с *${fromCourse}* курса для перевода:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

    if (data.startsWith('promo_group_')) {
      const [fromCourse, index] = data.replace('promo_group_', '').split('_');
      const fromGroup = GROUPS_CONFIG[fromCourse]?.[Number(index)];
      if (!fromGroup) {
        return ctx.answerCallbackQuery({ text: 'Группа не найдена.', show_alert: true });
      }

      const promo = promoteState.get(userId) || {};
      promo.fromGroup = fromGroup;
      promoteState.set(userId, promo);

      const keyboard = new InlineKeyboard()
        .text('1 курс', 'promo_to_1').row()
        .text('2 курс', 'promo_to_2').row()
        .text('3 курс', 'promo_to_3').row()
        .text('4 курс', 'promo_to_4').row()
        .text('Отмена', 'promo_cancel');

      await ctx.editMessageText(
        `📚 Группа *${fromGroup}* (${fromCourse} курс)\n\nВыберите *новый* курс:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

    if (data.startsWith('promo_to_')) {
      const toCourse = data.replace('promo_to_', '');
      if (!GROUPS_CONFIG[toCourse] || toCourse === GRADUATED_COURSE) {
        return ctx.answerCallbackQuery({ text: 'Курс не найден.', show_alert: true });
      }

      const promo = promoteState.get(userId) || {};
      promo.toCourse = toCourse;
      promoteState.set(userId, promo);

      const keyboard = new InlineKeyboard();
      GROUPS_CONFIG[toCourse].forEach((group, index) => {
        keyboard.text(group, `promo_target_${toCourse}_${index}`).row();
      });
      keyboard.text('Отмена', 'promo_cancel');

      await ctx.editMessageText(
        `📚 Выберите новую группу на *${toCourse}* курсе:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return ctx.answerCallbackQuery();
    }

    if (data.startsWith('promo_target_')) {
      const [toCourse, index] = data.replace('promo_target_', '').split('_');
      const toGroup = GROUPS_CONFIG[toCourse]?.[Number(index)];
      if (!toGroup) {
        return ctx.answerCallbackQuery({ text: 'Группа не найдена.', show_alert: true });
      }

      const promo = promoteState.get(userId) || {};
      promo.toGroup = toGroup;
      promoteState.set(userId, promo);

      const keyboard = new InlineKeyboard()
        .text('Подтвердить', 'promo_confirm').row()
        .text('Отмена', 'promo_cancel');

      await ctx.editMessageText(
        `📚 Перевести всех студентов:\n` +
        `Из: *${promo.fromGroup}* (${promo.fromCourse} курс)\n` +
        `В: *${toGroup}* (${toCourse} курс)\n\n` +
        `Это действие необратимо.`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
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
