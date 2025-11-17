require('dotenv').config();
const { Bot, InputFile, InlineKeyboard } = require('grammy');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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
    await ctx.reply(
      'Сначала выберите группу: /start'
    );
    return;
  }

  await ctx.reply('Генерирую расписание на неделю...');

  try {
    // === Параметры (только group и course) ===
    const params = new URLSearchParams({
      group: user.group_name,
      course: user.course,
    });

    // === Запрос к /o/week ===
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
          caption: `Расписание на *неделю*\nГруппа: *${user.group_name}*`,
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

// === Обработка callback ===
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

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
  }

  else if (data.startsWith('group_')) {
    const [, course, group] = data.split('_');
    await saveUser(userId, course, group);

    await ctx.editMessageText(
      `Отлично! Ваша группа: *${group}*\n\n` +
      `Теперь используйте:\n/today - расписание на сегодня\n/tomorrow — расписание на завтра\n/week — на неделю`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery('Группа сохранена!');
  }
});

// === Запуск ===
bot.start();
console.log('Бот запущен...');