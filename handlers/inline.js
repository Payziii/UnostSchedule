const { InlineKeyboard } = require('grammy');
const { allGroups } = require('../api');
const { getUserGroup } = require('../db');

const registerInline = (bot) => {

  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    let results = [];

    if (!query) {
      const userId = ctx.inlineQuery.from.id;
      const userGroup = await getUserGroup(userId);
      if (!userGroup) {
        results.push({
          type: 'article',
          id: 'error_no_group',
          title: 'Введите название группы',
          description: 'Введите название, как в расписании',
          input_message_content: { message_text: '❌ Ошибка: группа не введена.' }
        });
      } else {
        for (const [suffix, label, btn] of [
          ['week', 'на неделю', 'Показать на неделю'],
          ['today', 'на сегодня', 'Показать на сегодня'],
          ['tomorrow', 'на завтра', 'Показать на завтра'],
        ]) {
          results.push({
            type: 'article',
            id: `${suffix}_${userGroup}`,
            title: `Расписание ${label} для ${userGroup}`,
            description: 'Нажмите для просмотра',
            input_message_content: { message_text: `Расписание для ${userGroup} ${label}.` },
            reply_markup: new InlineKeyboard().text(btn, `show_${suffix}_${userGroup}`)
          });
        }
      }
    } else if (!allGroups.includes(query)) {
      results.push({
        type: 'article',
        id: 'error_invalid_group',
        title: 'Группа не найдена',
        description: 'Введите название, как в расписании',
        input_message_content: { message_text: `❌ Группа "${query}" не существует.` }
      });
    } else {
      for (const [suffix, label, btn] of [
        ['week', 'на неделю', 'Показать на неделю'],
        ['today', 'на сегодня', 'Показать на сегодня'],
        ['tomorrow', 'на завтра', 'Показать на завтра'],
      ]) {
        results.push({
          type: 'article',
          id: `${suffix}_${query}`,
          title: `Расписание ${label} для ${query}`,
          description: 'Нажмите для просмотра',
          input_message_content: { message_text: `Расписание для ${query} ${label}.` },
          reply_markup: new InlineKeyboard().text(btn, `show_${suffix}_${query}`)
        });
      }
    }

    await ctx.answerInlineQuery(results);
  });

};

module.exports = { registerInline };
