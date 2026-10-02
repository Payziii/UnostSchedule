const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { db } = require('./db');

// Инициализация S3-клиента для Cloudflare R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'payzi-dbs';
const TEMP_DB_PATH = path.join(__dirname, 'temp_users.db');

// Функция резервного копирования
async function createAndUploadBackup() {
  console.log('[Backup] Начало процесса резервного копирования...');

  // Удаляем старый временный файл, если он остался
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }

  // Создаем безопасный слепок SQLite базы данных
  db.run(`VACUUM INTO '${TEMP_DB_PATH}'`, async (err) => {
    if (err) {
      console.error('[Backup] Ошибка при создании слепка SQLite базы данных:', err);
      return;
    }

    console.log('[Backup] Безопасный слепок базы данных успешно создан.');

    try {
      // Читаем созданный слепок в буфер
      const fileStream = fs.readFileSync(TEMP_DB_PATH);

      // Формируем имя файла с текущей датой
      const dateStr = new Date().toISOString().split('T')[0];
      const backupFileName = `backup-${dateStr}.db`;

      // Путь внутри бакета: папка/имя_файла
      const r2Key = `UnostSchedule/${backupFileName}`;

      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: r2Key,
        Body: fileStream,
        ContentType: 'application/x-sqlite3'
      };

      // Отправляем файл в Cloudflare R2
      await r2Client.send(new PutObjectCommand(uploadParams));
      console.log(`[Backup] Бэкап успешно загружен в R2: ${r2Key}`);

    } catch (uploadError) {
      console.error('[Backup] Ошибка при отправке бэкапа в Cloudflare R2:', uploadError);
    } finally {
      // Удаляем временный файл с сервера
      if (fs.existsSync(TEMP_DB_PATH)) {
        fs.unlinkSync(TEMP_DB_PATH);
        console.log('[Backup] Временный локальный файл бэкапа удален.');
      }
    }
  });
}

// Функция запуска планировщика
function startBackupScheduler() {
  // Проверяем наличие необходимых переменных окружения
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.warn('[Backup] Cloudflare R2 credentials не настроены. Резервное копирование отключено.');
    return;
  }

  // Запуск планировщика: каждый день в 03:00
  cron.schedule('0 * * * *', () => {
    createAndUploadBackup();
  });

  console.log('[Backup] Планировщик резервного копирования запущен (ежедневно в 03:00).');
}

module.exports = {
  startBackupScheduler,
  createAndUploadBackup
};
