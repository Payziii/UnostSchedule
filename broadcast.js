const { getUsersByFilter } = require('./db');
const { mainKeyboard } = require('./keyboards');

const broadcastState = new Map();

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const runBroadcast = async (bot, adminId, messageId, chatId, filter, notificationType, withKeyboard = false, sendMethod = 'copy') => {
  const users = await getUsersByFilter(filter, notificationType);

  if (users.length === 0) {
    await bot.api.sendMessage(adminId, '⚠️ Не найдено пользователей для этой выборки.');
    return;
  }

  let success = 0, blocked = 0, errors = 0;

  const methodLabel = sendMethod === 'forward' ? 'пересылкой' : 'копированием';
  await bot.api.sendMessage(
    adminId,
    `🚀 Рассылка запущена на *${users.length}* пользователей (${methodLabel})...`,
    { parse_mode: 'Markdown' }
  );

  for (const row of users) {
    try {
      if (withKeyboard) {
        await bot.api.sendMessage(
          row.user_id,
          'undefined/undefined',
          { reply_markup: mainKeyboard() }
        );
        await sleep(100);
      }

      if (sendMethod === 'forward') {
        await bot.api.forwardMessage(row.user_id, chatId, messageId);
      } else {
        await bot.api.copyMessage(row.user_id, chatId, messageId);
      }

      success++;
    } catch (e) {
      if (e.description && (e.description.includes('blocked') || e.description.includes('kicked'))) {
        blocked++;
      } else {
        console.error(`Ошибка отправки ${row.user_id}:`, e.message);
        errors++;
      }
    }
    await sleep(50);
  }

  await bot.api.sendMessage(
    adminId,
    `🏁 *Рассылка завершена!*\n\n` +
    `✅ Успешно: ${success}\n` +
    `🚫 Блок/Удален: ${blocked}\n` +
    `⚠️ Ошибки: ${errors}\n` +
    `📊 Всего: ${users.length}`,
    { parse_mode: 'Markdown' }
  );
};

module.exports = { broadcastState, runBroadcast };
