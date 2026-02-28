const fs = require('fs');

const GROUPS_CONFIG = JSON.parse(fs.readFileSync('./groups.json', 'utf-8'));
const API_BASE_URL = 'http://109.120.135.25:4000';
const daysOfWeek = ["ВОСКРЕСЕНЬЕ", "ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА"];
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [];

const groups = require('./groups.json');
const allGroups = [].concat(...Object.values(groups));

module.exports = {
  GROUPS_CONFIG,
  API_BASE_URL,
  daysOfWeek,
  ADMIN_IDS,
  groups,
  allGroups
};