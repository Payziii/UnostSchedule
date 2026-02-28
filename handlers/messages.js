const { isAdmin } = require('../utils');
const { broadcastState, runBroadcast } = require('../broadcast');

function setupMessages(bot) {
  bot.on('message', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    if (!isAdmin(userId)) return;
    const state = broadcastState.get(userId);
    if (!state) return;

    if (state.stage === 'await_course') {
      state.filter = { course: text.trim() };
      state.stage = 'await_text';
      broadcastState.set(userId, state);
      await ctx.reply(
        `Курс установлен: *${state.filter.course}*.\n\nТеперь отправьте текст рассылки одним сообщением.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (state.stage === 'await_group') {
      state.filter = { group_name: text.trim() };
      state.stage = 'await_text';
      broadcastState.set(userId, state);
      await ctx.reply(
        `Группа установлена: *${state.filter.group_name}*.\n\nТеперь отправьте текст рассылки одним сообщением.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (state.stage === 'await_text') {
      const messageId = ctx.message.message_id;
      runBroadcast(bot, userId, messageId, state.filter);
      broadcastState.delete(userId);
    }
  });
}

module.exports = { setupMessages };