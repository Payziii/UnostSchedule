require('dotenv').config();
const fs = require('fs');

const GROUPS_CONFIG = JSON.parse(fs.readFileSync('./groups.json', 'utf-8'));

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [];

const API_BASE_URL = 'http://109.120.135.25:4000';

const daysOfWeek = ["ВОСКРЕСЕНЬЕ", "ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА"];

const isAdmin = (userId) => ADMIN_IDS.includes(userId);

module.exports = { GROUPS_CONFIG, ADMIN_IDS, API_BASE_URL, daysOfWeek, isAdmin };
