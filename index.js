require('dotenv').config();
const { Bot, GrammyError, HttpError } = require('grammy');

const { registerCommands } = require('./handlers/commands');
const { registerCallbacks } = require('./handlers/callbacks');
const { registerMessages } = require('./handlers/messages');
const { registerInline } = require('./handlers/inline');
const { createServer } = require('./server');

const bot = new Bot(process.env.BOT_TOKEN);

// Регистрируем все хендлеры
registerCommands(bot);
registerCallbacks(bot);
registerMessages(bot);
registerInline(bot);

// Запускаем Express-сервер
createServer(bot);

// Обработка ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Grammy error:', e.description);
  } else if (e instanceof HttpError) {
    console.error('HTTP error:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

bot.start();
console.log('Бот запущен...');
