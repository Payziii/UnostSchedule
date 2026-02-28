require('dotenv').config();
const { Bot, GrammyError, HttpError } = require('grammy');
const express = require('express');
const app = express();
app.use(express.json());

const bot = new Bot(process.env.BOT_TOKEN);

const { db } = require('./db');
const { setupCommands } = require('./handlers/commands');
const { setupCallbacks } = require('./handlers/callbacks');
const { setupMessages } = require('./handlers/messages');
const { setupInline } = require('./handlers/inline');
const { setupServer } = require('./server');

// Инициализация базы данных
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      course TEXT,
      group_name TEXT
    )
  `);
});

// Настройка обработчиков
setupCommands(bot);
setupCallbacks(bot);
setupInline(bot);
setupMessages(bot);
setupServer(app, bot);

// Обработчик ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Запуск
bot.start();
app.listen(5000, () => {
  console.log('🤖 Сервер публичного бота слушает порт 5000');
});
console.log('Бот запущен...');