const express = require('express');
const fs = require('fs');
const { InputFile } = require('grammy');
const { getUsersByGroup } = require('./db');

const requireBearerToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

const createServer = (bot) => {
  const app = express();
  app.use(express.json());

  app.post('/internal/notify', requireBearerToken, async (req, res) => {
    const { group, changedDays, filePath, url } = req.body;
    console.log(`📩 Обновление расписания для группы ${group}`);

    try {
      const users = await getUsersByGroup(group);

      if (users.length === 0) {
        console.log(`Нет подписчиков для группы ${group}`);
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
        return res.json({ status: 'no_users' });
      }

      // Фильтруем пользователей с включёнными уведомлениями об изменениях
      const { db } = require('./db');
      const filteredUsers = await new Promise((resolve, reject) => {
        const userIds = users.map(u => u.user_id).join(',');
        db.all(
          `SELECT user_id FROM users WHERE user_id IN (${userIds}) AND schedule_change_notifications = 1`,
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

      if (filteredUsers.length === 0) {
        console.log(`Нет пользователей с включёнными уведомлениями для группы ${group}`);
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
        return res.json({ status: 'no_users_with_notifications' });
      }

      const caption =
        `📢 <b>Расписание обновлено!</b>\n` +
        `Группа: <b>${group}</b>\n` +
        `Дни: <b>${changedDays.join(', ')}</b>\n` +
        `Ссылка: <a href="${url}">Клик</a>`;

      const photo = new InputFile(filePath);
      let successCount = 0;

      for (const user of filteredUsers) {
        try {
          await bot.api.sendPhoto(user.user_id, photo, { caption, parse_mode: 'HTML' });
          successCount++;
          await new Promise(r => setTimeout(r, 50));
        } catch (e) {
          console.error(`Ошибка отправки ${user.user_id}:`, e.description);
        }
      }

      console.log(`✅ Отправлено: ${successCount}/${filteredUsers.length}`);

      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
      }, 10000);

      res.json({ status: 'ok', sent: successCount, total: filteredUsers.length });
    } catch (e) {
      console.error('Ошибка в notify:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(5000, () => {
    console.log('🤖 Сервер слушает порт 5000');
  });
};

module.exports = { createServer };
