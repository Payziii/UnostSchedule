const { InlineKeyboard } = require('grammy');
const { hasAcceptedTerms, setTermsAccepted } = require('./db');

const TERMS_URL = 'https://github.com/Payziii/UnostSchedule/blob/main/TERMS.md';

const TERMS_TEXT =
  `📋 *Условия использования*\n\n` +
  `Перед использованием бота ознакомьтесь с [условиями использования](${TERMS_URL}).\n\n` +
  `*Кратко:*\n` +
  `• Бот — неофициальный любительский проект, не связанный с администрацией ГАПОУ СО ВПМТТ "Юность"\n` +
  `• Информация носит справочный характер. Мы не гарантируем её полноту, точность и надёжность — используйте на свой риск\n` +
  `• Мы не несём ответственности за любые проблемы или убытки от использования бота\n` +
  `• Всегда сверяйтесь с оригинальным расписанием в мессенджере MAX\n` +
  `• Хранятся только ваш Telegram ID, курс и группа — ничего больше\n\n` +
  `Нажимая «Принимаю», вы подтверждаете, что прочитали и принимаете условия.`;

const DECLINED_TEXT =
  `🚫 Без принятия условий пользоваться ботом нельзя.\n\n` +
  `Если передумаете — нажмите «Принимаю» ниже.`;

const termsKeyboard = () => new InlineKeyboard()
  .url('📖 Читать полностью', TERMS_URL).row()
  .text('✅ Принимаю', 'terms_accept').row()
  .text('❌ Не принимаю', 'terms_decline');

const sendTerms = (ctx, prefix = '') =>
  ctx.reply(prefix ? `${prefix}\n\n${TERMS_TEXT}` : TERMS_TEXT, {
    parse_mode: 'Markdown',
    reply_markup: termsKeyboard(),
    link_preview_options: { is_disabled: true },
  });

// Пропускает дальше только пользователей, принявших условия
const termsGate = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const data = ctx.callbackQuery?.data;
  if (data === 'terms_accept' || data === 'terms_decline') return next();

  if (await hasAcceptedTerms(userId)) return next();

  if (ctx.inlineQuery) {
    return ctx.answerInlineQuery([{
      type: 'article',
      id: 'terms_required',
      title: 'Примите условия использования',
      description: 'Откройте бота и нажмите «Принимаю»',
      input_message_content: { message_text: '❌ Сначала примите условия использования бота.' },
    }]);
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: 'Сначала примите условия использования.', show_alert: true });
    return sendTerms(ctx);
  }

  await sendTerms(ctx);
};

const registerTerms = (bot) => {
  bot.callbackQuery('terms_accept', async (ctx) => {
    await setTermsAccepted(ctx.from.id, true);
    await ctx.editMessageText(
      '✅ Спасибо! Условия приняты.\n\nНачните с /start — выберите курс и группу.',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery('Условия приняты');
  });

  bot.callbackQuery('terms_decline', async (ctx) => {
    await setTermsAccepted(ctx.from.id, false);
    await ctx.answerCallbackQuery({ text: 'Без согласия бот недоступен.', show_alert: true });
    await sendTerms(ctx, DECLINED_TEXT);
  });
};

module.exports = { termsGate, registerTerms, sendTerms, TERMS_URL };
