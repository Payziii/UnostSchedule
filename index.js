require('dotenv').config();
const { Bot, GrammyError, HttpError } = require('grammy');
const { run, sequentialize } = require("@grammyjs/runner");
const { autoRetry } = require("@grammyjs/auto-retry");
const { apiThrottler } = require("@grammyjs/transformer-throttler");

const { registerCommands } = require('./handlers/commands');
const { registerCallbacks } = require('./handlers/callbacks');
const { registerMessages } = require('./handlers/messages');
const { registerInline } = require('./handlers/inline');
const { termsGate, registerTerms } = require('./terms');
const { createServer } = require('./server');
const { startBackupScheduler } = require('./backup');

const bot = new Bot(process.env.BOT_TOKEN);

bot.api.config.use(apiThrottler());
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));

bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

bot.use(async (ctx, next) => {
  const id = ctx.from?.id;
  const t = Date.now();
  console.log(`[${id}] начало`);
  await next();
  console.log(`[${id}] конец, ${Date.now() - t} мс`);
});

// Согласие с условиями — до всех остальных хендлеров
registerTerms(bot);
bot.use(termsGate);

// Регистрируем все хендлеры
registerCommands(bot);
registerCallbacks(bot);
registerMessages(bot);
registerInline(bot);

// Запускаем Express-сервер
createServer(bot);

// Запускаем планировщик резервного копирования
startBackupScheduler();

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

run(bot);
console.log('Бот запущен...');
