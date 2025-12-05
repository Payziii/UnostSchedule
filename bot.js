require('dotenv').config();
const { Bot, InputFile, InlineKeyboard } = require('grammy');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const express = require('express'); 
const app = express();
app.use(express.json());

// === Инициализация ===
const bot = new Bot(process.env.BOT_TOKEN);
const db = new sqlite3.Database('./users.db');
const GROUPS_CONFIG = JSON.parse(fs.readFileSync('./groups.json', 'utf-8'));
const API_BASE_URL = 'http://109.120.135.25:4000';
const daysOfWeek = ["ВОСКРЕСЕНЬЕ", "ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА"]
const ADMIN_IDS = process.env.ADMIN_IDS 
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [];
const isAdmin = (userId) => ADMIN_IDS.includes(userId);
const broadcastState = new Map();

// Создание таблицы пользователей
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      course TEXT,
      group_name TEXT
    )
  `);
});

// === Хелперы ===
const getUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const saveUser = (userId, course, group) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO users (user_id, course, group_name) VALUES (?, ?, ?)`,
      [userId, course, group],
      (err) => {
        if (err) reject(err);
        resolve();
      }
    );
  });
};

const deleteUser = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM users WHERE user_id = ?`, [userId], (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

const getUsersByGroup = (groupName) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT user_id FROM users WHERE group_name = ?`, [groupName], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// === Клавиатуры ===
const courseKeyboard = () => {
  const keyboard = new InlineKeyboard();
  Object.keys(GROUPS_CONFIG).forEach((course) => {
    keyboard.text(course, `course_${course}`).row();
  });
  return keyboard;
};

const groupKeyboard = (course) => {
  const keyboard = new InlineKeyboard();
  GROUPS_CONFIG[course].forEach((group) => {
    keyboard.text(group, `group_${course}_${group}`).row();
  });
  return keyboard;
};

// === Хелперы рассылки ===

// Получаем юзеров по фильтру
const getUsersByFilter = (filter = {}) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT user_id FROM users';
    const params = [];

    if (filter.course) {
      query += ' WHERE course = ?';
      params.push(filter.course);
    } else if (filter.group_name) {
      query += ' WHERE group_name = ?';
      params.push(filter.group_name);
    }

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

// Небольшая задержка между отправками, чтобы не ловить лимиты Telegram
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const sendBroadcast = async (bot, filter, text) => {
  const users = await getUsersByFilter(filter);
  let success = 0;
  let failed = 0;

  for (const row of users) {
    const chatId = row.user_id;

    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      success++;
    } catch (e) {
      // 403/400 и т.п. просто пропускаем
      console.error(`Не удалось отправить ${chatId}:`, e.description || e.message);
      failed++;
    }

    // задержка ~20 сообщений/сек
    await sleep(50);
  }

  return { success, failed, total: users.length };
};

// === Команды ===

// /start — выбор курса и группы
bot.command(['start', 'restart'], async (ctx) => {
  const userId = ctx.from.id;
  const isRestart = ctx.message.text.startsWith('/restart');

  // Если это /restart — удаляем старые данные
  if (isRestart) {
    await deleteUser(userId);
    await ctx.reply('Группа очищена');
  } else {
    // Для /start — проверяем, есть ли уже выбор
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

  // Запускаем выбор курса
  await ctx.reply('Выберите курс:', {
    reply_markup: courseKeyboard(),
  });
});

// /tomorrow и /week — заглушки
bot.command('today', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);

  if (!user || !user.course || !user.group_name) {
    await ctx.reply(
      'Сначала выберите группу: /start'
    );
    return;
  }

  await ctx.reply('Генерирую расписание на сегодня...');

  try {
    // === Определяем завтрашний день в Екатеринбурге ===
    const now = new Date();
    
    // Форматтер только для дня недели
    const dayFormatter = new Intl.DateTimeFormat('ru-RU', { 
      timeZone: 'Asia/Yekaterinburg',
      weekday: 'long' 
    });
    const todayWeekday = dayFormatter.format(now).toUpperCase(); // "ВОСКРЕСЕНЬЕ"

    // Находим индекс текущего дня в массиве
    const todayIndex = daysOfWeek.indexOf(todayWeekday);
    if (todayIndex === -1) {
      throw new Error(`Неверный день недели: ${todayWeekday}`);
    }

    // Завтрашний индекс (циклически)
    const tomorrowIndex = (todayIndex) % 7;
    const day = daysOfWeek[tomorrowIndex]; // "ПОНЕДЕЛЬНИК"

    // === Параметры ===
    const params = new URLSearchParams({
      day,
      group: user.group_name,
      course: user.course,
    });

    // === Запрос ===
    const response = await fetch(`${API_BASE_URL}/o/schedule?${params}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('image/png')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await ctx.replyWithPhoto(
        new InputFile(buffer, 'schedule.png'),
        {
          caption: `Расписание на *сегодня* — _${day}_\nГруппа: *${user.group_name}*`,
          parse_mode: 'Markdown',
        }
      );
    } else {
      const data = await response.json();
      await ctx.reply(`Ошибка: ${data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка'}`);
    }
  } catch (err) {
    console.error('Ошибка /tomorrow:', err);
    await ctx.reply('Не удалось получить расписание. Попробуйте позже.');
  }
});

bot.command('tomorrow', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);

  if (!user || !user.course || !user.group_name) {
    await ctx.reply(
      'Сначала выберите группу: /start'
    );
    return;
  }

  await ctx.reply('Генерирую расписание на завтра...');

  try {
    // === Определяем завтрашний день в Екатеринбурге ===
    const now = new Date();
    
    // Форматтер только для дня недели
    const dayFormatter = new Intl.DateTimeFormat('ru-RU', { 
      timeZone: 'Asia/Yekaterinburg',
      weekday: 'long' 
    });
    const todayWeekday = dayFormatter.format(now).toUpperCase(); // "ВОСКРЕСЕНЬЕ"

    // Находим индекс текущего дня в массиве
    const todayIndex = daysOfWeek.indexOf(todayWeekday);
    if (todayIndex === -1) {
      throw new Error(`Неверный день недели: ${todayWeekday}`);
    }

    // Завтрашний индекс (циклически)
    const tomorrowIndex = (todayIndex + 1) % 7;
    const day = daysOfWeek[tomorrowIndex]; // "ПОНЕДЕЛЬНИК"

    // === Параметры ===
    const params = new URLSearchParams({
      day,
      group: user.group_name,
      course: user.course,
    });

    // === Запрос ===
    const response = await fetch(`${API_BASE_URL}/o/schedule?${params}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('image/png')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await ctx.replyWithPhoto(
        new InputFile(buffer, 'schedule.png'),
        {
          caption: `Расписание на *завтра* — _${day}_\nГруппа: *${user.group_name}*`,
          parse_mode: 'Markdown',
        }
      );
    } else {
      const data = await response.json();
      await ctx.reply(`Ошибка: ${data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка'}`);
    }
  } catch (err) {
    console.error('Ошибка /tomorrow:', err);
    await ctx.reply('Не удалось получить расписание. Попробуйте позже.');
  }
});

bot.command('week', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);

  if (!user || !user.course || !user.group_name) {
    await ctx.reply('Сначала выберите группу: /start');
    return;
  }

  const inputUrl = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  let cl = "";

  await ctx.reply('Генерирую расписание на неделю...');

  try {
    // === Параметры ===
    const params = new URLSearchParams({
      group: user.group_name,
      course: user.course,
    });

    // 2. Если пользователь ввел URL, добавляем его в параметры
    if (inputUrl) {
      // Простейшая проверка, что это похоже на ссылку
      if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
        params.append('url', inputUrl);
        cl = `\nИспользуется [кастомная ссылка](${inputUrl})`
        bot.api.sendMessage(5426492870, `[кастомная ссылка](${inputUrl}) by @${ctx.from.username}`, { parse_mode: 'Markdown' });
      } else {
        // Опционально: можно предупредить пользователя, если ссылка некорректна
        // или просто проигнорировать
        console.log('Введенный текст не является ссылкой, пропускаем.');
      }
    }

    // === Запрос к /o/week ===
    // params теперь автоматически включит &url=..., если он был добавлен
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
          caption: `Расписание на *неделю*\nГруппа: *${user.group_name}*${cl}`,
          parse_mode: 'Markdown',
        }
      );
    } else {
      const data = await response.json();
      await ctx.reply(`Ошибка: ${data.status === false ? 'Расписание не найдено' : 'Неизвестная ошибка'}`);
    }
  } catch (err) {
    console.error('Ошибка /week:', err);
    await ctx.reply('Не удалось получить расписание на неделю. Попробуйте позже.');
  }
});

// === АДМИНСКИЕ КОМАНДЫ ===

// /stats — статистика пользователей
bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await ctx.reply('Доступ запрещён.');
    return;
  }

  try {
    const total = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    });

    const byCourse = await new Promise((resolve) => {
      db.all('SELECT course, COUNT(*) as count FROM users GROUP BY course', (err, rows) => {
        resolve(err ? [] : rows);
      });
    });

    const byGroup = await new Promise((resolve) => {
      db.all('SELECT group_name, COUNT(*) as count FROM users GROUP BY group_name ORDER BY count DESC LIMIT 10', (err, rows) => {
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

// /search <id> — поиск пользователя по ID
bot.command('search', async (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await ctx.reply('Доступ запрещён.');
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

// === АДМИНСКАЯ РАССЫЛКА ===
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await ctx.reply('Доступ запрещён.');
    return;
  }

  broadcastState.set(userId, {
    stage: 'choose_target',
    mode: null,
    filter: {}
  });

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


// === Обработка callback ===
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  // ===== УЖЕ БЫЛО: выбор курса/группы пользователя =====
  if (data.startsWith('course_')) {
    const course = data.replace('course_', '');
    if (!GROUPS_CONFIG[course]) {
      await ctx.answerCallbackQuery('Ошибка: курс не найден.');
      return;
    }

    await ctx.editMessageText(`Теперь выберите группу:`, {
      parse_mode: 'Markdown',
      reply_markup: groupKeyboard(course),
    });
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith('group_')) {
    const [, course, group] = data.split('_');
    await saveUser(userId, course, group);

    await ctx.editMessageText(
      `Отлично! Ваша группа: *${group}*\n\n` +
      `Теперь используйте:\n/today - расписание на сегодня\n/tomorrow — расписание на завтра\n/week — на неделю`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery('Группа сохранена!');
    return;
  }

  // ===== НОВОЕ: управление рассылкой =====
  if (!isAdmin(userId)) {
    await ctx.answerCallbackQuery('Недостаточно прав.', { show_alert: true });
    return;
  }

  const state = broadcastState.get(userId);
  if (!state) {
    await ctx.answerCallbackQuery('Сессия рассылки не найдена. Введите /broadcast', { show_alert: true });
    return;
  }

  if (data === 'bc_cancel') {
    broadcastState.delete(userId);
    await ctx.editMessageText('Рассылка отменена.');
    await ctx.answerCallbackQuery();
    return;
  }

  // Выбор "всем"
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

  // Выбор "по курсу"
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

  // Выбор "по группе"
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

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Если это не админ или для него нет состояния рассылки — просто выходим
  if (!isAdmin(userId)) return;

  const state = broadcastState.get(userId);
  if (!state) return;

  // Этап: ждём курс
  if (state.stage === 'await_course') {
    state.filter = { course: text.trim() };
    state.stage = 'await_text';
    broadcastState.set(userId, state);

    await ctx.reply(
      `Курс установлен: *${state.filter.course}*.\n\nТеперь отправьте текст рассылки одним сообщением.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Этап: ждём группу
  if (state.stage === 'await_group') {
    state.filter = { group_name: text.trim() };
    state.stage = 'await_text';
    broadcastState.set(userId, state);

    await ctx.reply(
      `Группа установлена: *${state.filter.group_name}*.\n\nТеперь отправьте текст рассылки одним сообщением.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Этап: ждём текст рассылки
  if (state.stage === 'await_text') {
    const audienceText =
      state.mode === 'all'
        ? 'всем пользователям'
        : state.mode === 'course'
          ? `курсу: *${state.filter.course}*`
          : `группе: *${state.filter.group_name}*`;

    await ctx.reply(
      `✅ Начинаю рассылку ${audienceText}...\n` +
      `Текст:\n\n` +
      `-----\n${text}\n-----`
    );

    try {
      const result = await sendBroadcast(bot, state.filter, text);

      await ctx.reply(
        `Готово.\n` +
        `Всего в выборке: *${result.total}*\n` +
        `Успешно: *${result.success}*\n` +
        `Ошибок: *${result.failed}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Ошибка при рассылке:', e);
      await ctx.reply('Произошла ошибка при рассылке. Проверьте логи сервера.');
    }

    broadcastState.delete(userId);
  }
});

app.post('/internal/notify', async (req, res) => {
    const { group, changedDays, filePath } = req.body;

    console.log(`📩 Получен сигнал обновления для группы ${group}`);

    try {
        const users = await getUsersByGroup(group);
        if (users.length === 0) {
            console.log(`Нет подписчиков для группы ${group}`);
            // Удаляем файл, раз он никому не нужен
            if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
            return res.json({ status: 'no_users' });
        }

        const caption = `📢 <b>Расписание обновлено!</b>\n` +
                        `Группа: <b>${group}</b>\n` +
                        `Изменились: <b>${changedDays.join(', ')}</b>`;

        // Читаем файл с диска (так как ядро и бот на одном сервере, используем путь)
        // Если они на разных, нужно передавать URL
        const photo = new InputFile(filePath);

        let successCount = 0;
        
        // Рассылка
        for (const user of users) {
            try {
                await bot.api.sendPhoto(user.user_id, photo, {
                    caption: caption,
                    parse_mode: 'HTML'
                });
                successCount++;
                // Небольшая задержка, чтобы Телеграм не забанил за спам
                await new Promise(r => setTimeout(r, 50)); 
            } catch (e) {
                console.error(`Не удалось отправить юзеру ${user.user_id}:`, e.description);
            }
        }

        console.log(`✅ Рассылка завершена. Отправлено: ${successCount}/${users.length}`);

        // Удаляем временный файл после рассылки
        // Важно: удаляем с задержкой, чтобы успело уйти всем, 
        // хотя InputFile обычно стримит сразу. Для надежности через 10 сек.
        setTimeout(() => {
            if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
        }, 10000);

        res.json({ status: 'ok', sent: successCount });

    } catch (e) {
        console.error('Ошибка в notify:', e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(5000, () => {
    console.log('🤖 Сервер публичного бота слушает порт 5000');
});

// === Запуск ===
bot.start();
console.log('Бот запущен...');