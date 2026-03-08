const { getUsersByFilter } = require('./db');

const broadcastState = new Map();

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const runBroadcast = async (bot, adminId, messageId, filter) => {
  const users = await getUsersByFilter(filter);

  if (users.length === 0) {
    await bot.api.sendMessage(adminId, '⚠️ Не найдено пользователей для этой выборки.');
    return;
  }

  let success = 0, blocked = 0, errors = 0;

  await bot.api.sendMessage(
    adminId,
    `🚀 Рассылка запущена на *${users.length}* пользователей...`,
    { parse_mode: 'Markdown' }
  );

  for (const row of users) {
    try {
      await bot.api.copyMessage(row.user_id, adminId, messageId);
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
