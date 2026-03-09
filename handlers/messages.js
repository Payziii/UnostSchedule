const { isAdmin } = require('../config');
const { broadcastState, runBroadcast } = require('../broadcast');

const registerMessages = (bot) => {

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
      return ctx.reply(`Курс: *${state.filter.course}*.\n\nОтправьте текст рассылки.`, { parse_mode: 'Markdown' });
    }

    if (state.stage === 'await_group') {
      state.filter = { group_name: text.trim() };
      state.stage = 'await_text';
      broadcastState.set(userId, state);
      return ctx.reply(`Группа: *${state.filter.group_name}*.\n\nОтправьте текст рассылки.`, { parse_mode: 'Markdown' });
    }

    if (state.stage === 'await_text') {
      runBroadcast(bot, userId, ctx.message.message_id, state.filter);
      broadcastState.delete(userId);
    }
  });

};

module.exports = { registerMessages };
