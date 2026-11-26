'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const file = path.join(cfg.dataDir, 'db.json');
const base = { mode: 'public', banned: [], users: {}, reminders: [], stats: { commands: 0, byCommand: {} } };
let data = JSON.parse(JSON.stringify(base));
let timer = null;

function load() {
  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    if (fs.existsSync(file)) data = Object.assign({}, base, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    console.error('[db] gagal memuat, memakai data kosong:', e.message);
  }
  return data;
}
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(cfg.dataDir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(data));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { console.error('[db] gagal menyimpan:', e.message); }
  }, 400);
}
const get = () => data;
function touchUser(num, name) {
  const u = data.users[num] || (data.users[num] = { first: Date.now(), count: 0 });
  u.last = Date.now(); u.count++; if (name) u.name = name;
  save();
}
function countCommand(name) {
  data.stats.commands++;
  data.stats.byCommand[name] = (data.stats.byCommand[name] || 0) + 1;
  save();
}
module.exports = { load, save, get, touchUser, countCommand, _reset: () => { data = JSON.parse(JSON.stringify(base)); } };
