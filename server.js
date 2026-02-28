const fs = require('fs');
const { InputFile } = require('grammy');
const { getUsersByGroup } = require('./db');

function setupServer(app, bot) {
  app.post('/internal/notify', async (req, res) => {
    const { group, changedDays, filePath, url } = req.body;
    console.log(`📩 Получен сигнал обновления для группы ${group}`);
    try {
      const users = await getUsersByGroup(group);
      if (users.length === 0) {
        console.log(`Нет подписчиков для группы ${group}`);
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
        return res.json({ status: 'no_users' });
      }
      const caption = `📢 <b>Расписание обновлено!</b>\n` +
                      `Группа: <b>${group}</b>\n` +
                      `Дни изменились: <b>${changedDays.join(', ')}</b>\n` +
                      `Ссылка на таблицу: <a href="${url}">Клик</a>`;
      const photo = new InputFile(filePath);
      let successCount = 0;
      for (const user of users) {
        try {
          await bot.api.sendPhoto(user.user_id, photo, {
            caption: caption,
            parse_mode: 'HTML'
          });
          successCount++;
          await new Promise(r => setTimeout(r, 50));
        } catch (e) {
          console.error(`Не удалось отправить юзеру ${user.user_id}:`, e.description);
        }
      }
      console.log(`✅ Рассылка завершена. Отправлено: ${successCount}/${users.length}`);
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
      }, 10000);
      res.json({ status: 'ok', sent: successCount });
    } catch (e) {
      console.error('Ошибка в notify:', e);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { setupServer };