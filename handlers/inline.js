const { InlineKeyboard } = require('grammy');
const { allGroups } = require('../api');

const registerInline = (bot) => {

  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    let results = [];

    if (!query) {
      results.push({
        type: 'article',
        id: 'error_no_group',
        title: 'Введите название группы',
        description: 'Введите название, как в расписании',
        input_message_content: { message_text: '❌ Ошибка: группа не введена.' }
      });
    } else if (!allGroups.includes(query)) {
      results.push({
        type: 'article',
        id: 'error_invalid_group',
        title: 'Группа не найдена',
        description: 'Введите название, как в расписании',
        input_message_content: { message_text: `❌ Группа "${query}" не существует.` }
      });
    } else {
      results.push({
        type: 'article',
        id: `week_${query}`,
        title: `Расписание на неделю для ${query}`,
        description: 'Нажмите для просмотра',
        input_message_content: { message_text: `Расписание для ${query} на неделю.` },
        reply_markup: new InlineKeyboard().text('Показать на неделю', `show_week_${query}`)
      });
      results.push({
        type: 'article',
        id: `today_${query}`,
        title: `Расписание на сегодня для ${query}`,
        description: 'Нажмите для просмотра',
        input_message_content: { message_text: `Расписание для ${query} на сегодня.` },
        reply_markup: new InlineKeyboard().text('Показать на сегодня', `show_today_${query}`)
      });
      results.push({
        type: 'article',
        id: `tomorrow_${query}`,
        title: `Расписание на завтра для ${query}`,
        description: 'Нажмите для просмотра',
        input_message_content: { message_text: `Расписание для ${query} на завтра.` },
        reply_markup: new InlineKeyboard().text('Показать на завтра', `show_tomorrow_${query}`)
      });
    }

    await ctx.answerInlineQuery(results);
  });

};

module.exports = { registerInline };
