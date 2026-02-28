const { sleep } = require('./utils');

const broadcastState = new Map();

async function runBroadcast(bot, adminId, messageId, filter) {
  const { getUsersByFilter } = require('./db');
  const users = await getUsersByFilter(filter);

  if (users.length === 0) {
    await bot.api.sendMessage(adminId, '⚠️ Не найдено пользователей для этой выборки.');
    return;
  }
  let success = 0;
  let blocked = 0;
  let errors = 0;
  await bot.api.sendMessage(adminId, `🚀 Рассылка запущена на **${users.length}** пользователей...`, { parse_mode: 'Markdown' });
  for (const row of users) {
    const targetId = row.user_id;
    try {
      await bot.api.copyMessage(targetId, adminId, messageId);
      success++;
    } catch (e) {
      if (e.description && (e.description.includes('blocked') || e.description.includes('kicked'))) {
        blocked++;
      } else {
        console.error(`Ошибка отправки ${targetId}:`, e.message);
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
}

module.exports = {
  broadcastState,
  runBroadcast
};