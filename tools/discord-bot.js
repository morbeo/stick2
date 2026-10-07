#!/usr/bin/env node
// A Discord bot that runs "!fight <char> <char> [<char> [<char>]]" (2-4 names, "random" picks one), renders a GIF via tools/mcp.js and posts it.
// usage: DISCORD_BOT_TOKEN=... node tools/discord-bot.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client, GatewayIntentBits, AttachmentBuilder, PermissionsBitField } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error('set DISCORD_BOT_TOKEN');

const SCENARIO_BY_COUNT = { 2: 'ai vs ai', 3: 'ai 3-way', 4: 'ai free-for-all' };
const OUT_DIR = path.join(__dirname, '..', 'out');
const CONFIG_FILE = path.join(OUT_DIR, 'bot-config.json');

// ---------- runtime-adjustable config: role gate, channel gate, throttling (admins/mods bypass the role and throttle) ----------
const defaultConfig = {
  role: process.env.DISCORD_FIGHT_ROLE || null, // role name required to use !fight (null: everyone)
  channel: process.env.DISCORD_FIGHT_CHANNEL || null, // channel name !fight is restricted to (null: any channel)
  userCooldownMs: Number(process.env.DISCORD_USER_COOLDOWN_MS || 30000),
  globalCooldownMs: Number(process.env.DISCORD_GLOBAL_COOLDOWN_MS || 5000),
};
let config = { ...defaultConfig };
try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch {}
function saveConfig() { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }

const lastUserFight = new Map(); // userId -> timestamp

function isModOrAdmin(member) {
  return member?.permissions.has(PermissionsBitField.Flags.ManageGuild) ?? false;
}

function checkAccess(message) {
  if (config.channel && message.channel.name !== config.channel) throw new Error(`fights can only be requested in #${config.channel}`);
  if (isModOrAdmin(message.member)) return;
  if (config.role && !message.member?.roles.cache.some(r => r.name.toLowerCase() === config.role.toLowerCase()))
    throw new Error(`you need the "${config.role}" role to request fights`);
}

function checkUserThrottle(message) {
  if (isModOrAdmin(message.member)) return;
  const now = Date.now(), last = lastUserFight.get(message.author.id) || 0;
  if (now - last < config.userCooldownMs) throw new Error(`you're on cooldown, wait ${Math.ceil((config.userCooldownMs - (now - last)) / 1000)}s`);
  lastUserFight.set(message.author.id, now);
}

function handleConfigCommand(message, arg) {
  if (!isModOrAdmin(message.member)) throw new Error('only mods/admins can change fight config');
  const [key, ...rest] = arg.trim().split(/\s+/);
  const value = rest.join(' ');
  switch (key) {
    case 'role': config.role = value === 'none' || !value ? null : value; break;
    case 'channel': config.channel = value === 'none' || !value ? null : value.replace(/^#/, ''); break;
    case 'usercooldown': config.userCooldownMs = Math.max(0, Number(value) * 1000); break;
    case 'globalcooldown': config.globalCooldownMs = Math.max(0, Number(value) * 1000); break;
    case 'show': case '': return message.reply(showConfig());
    default: throw new Error('usage: !fightconfig <role <name|none> | channel <#name|none> | usercooldown <seconds> | globalcooldown <seconds> | show>');
  }
  saveConfig();
  return message.reply(`ok — ${showConfig()}`);
}
function showConfig() {
  return `role: ${config.role || '(none, open to everyone)'}, channel: ${config.channel ? '#' + config.channel : '(any)'}, user cooldown: ${config.userCooldownMs / 1000}s, global cooldown: ${config.globalCooldownMs / 1000}s`;
}

// ---------- a global queue: requests during the cooldown wait their turn instead of being rejected ----------
let queue = Promise.resolve();
let queueLength = 0;
let lastFightStarted = 0;
function enqueueFight(run) {
  queueLength++;
  const result = queue.then(async () => {
    const wait = config.globalCooldownMs - (Date.now() - lastFightStarted);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastFightStarted = Date.now();
    return run();
  });
  queue = result.catch(() => {}).finally(() => { queueLength--; });
  return result;
}

// ---------- a tiny JSON-RPC stdio client for tools/mcp.js, restarted on crash ----------
function startEngine() {
  let proc, rl, ready, alive = true;
  const pending = new Map();
  let nextId = 1;
  const spawnProc = () => {
    proc = spawn('node', [path.join(__dirname, 'mcp.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
    rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    });
    proc.on('exit', code => {
      alive = false;
      console.error(`engine exited (code ${code}), restarting in 3s`);
      for (const { reject } of pending.values()) reject(new Error('engine restarted mid-request'));
      pending.clear();
      setTimeout(() => { spawnProc(); ready = initialize(); alive = true; }, 3000);
    });
  };
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const initialize = () => request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stick2-discord-bot', version: '1' } })
    .then(() => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'));
  const callTool = async (name, args) => {
    if (!alive) throw new Error('the fight engine is restarting, try again shortly');
    const result = await request('tools/call', { name, arguments: args });
    if (result.isError) throw new Error(result.content?.[0]?.text || 'tool error');
    return result;
  };
  spawnProc();
  ready = initialize();
  return { callTool, get ready() { return ready; }, get alive() { return alive; } };
}

const engine = startEngine();

async function listCharacterNames() {
  const result = await engine.callTool('list_characters', {});
  const text = result.content.find(c => c.type === 'text').text;
  return JSON.parse(text).map(c => c.name);
}

async function renderFight(chars, seed) {
  const scenario = SCENARIO_BY_COUNT[chars.length];
  const sim = await engine.callTool('simulate', { scenario, chars, seed, events: false });
  const simData = JSON.parse(sim.content.find(c => c.type === 'text').text);
  const gif = await engine.callTool('render_gif', { simulation: simData.id, to: Math.min(simData.N, 1200) });
  const meta = JSON.parse(gif.content.find(c => c.type === 'text').text);
  return { path: meta.path, winner: simData.winner };
}

function parseFightCommand(text, roster) {
  const names = text.trim().split(/\s+/).filter(n => n.toLowerCase() !== 'vs');
  if (names.length < 2 || names.length > 4) throw new Error('name 2 to 4 fighters: `!fight hadoo sneeko` or `!fight random random random random`');
  return names.map(n => {
    if (n.toLowerCase() === 'random') return roster[Math.floor(Math.random() * roster.length)];
    const match = roster.find(c => c.toLowerCase() === n.toLowerCase());
    if (!match) throw new Error(`no character "${n}" (roster: ${roster.join(', ')})`);
    return match;
  });
}

// ---------- out/ cleanup: fight gifs pile up fast, delete old ones on a timer ----------
const OUT_RETAIN_MS = Number(process.env.OUT_RETAIN_MS || 2 * 60 * 60 * 1000); // 2h
const OUT_CLEAN_INTERVAL_MS = Number(process.env.OUT_CLEAN_INTERVAL_MS || 15 * 60 * 1000); // 15m
function cleanOutDir() {
  let files; try { files = fs.readdirSync(OUT_DIR); } catch { return; }
  const now = Date.now();
  for (const f of files) {
    if (!f.endsWith('.gif')) continue;
    const full = path.join(OUT_DIR, f);
    let stat; try { stat = fs.statSync(full); } catch { continue; }
    if (now - stat.mtimeMs > OUT_RETAIN_MS) { try { fs.unlinkSync(full); } catch {} }
  }
}
setInterval(cleanOutDir, OUT_CLEAN_INTERVAL_MS);

async function main() {
  await engine.ready;
  const roster = await listCharacterNames();
  cleanOutDir();

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!fightconfig')) {
      try { await handleConfigCommand(message, message.content.slice('!fightconfig'.length)); }
      catch (err) { await message.reply(err.message); }
      return;
    }

    if (message.content.startsWith('!fightstatus')) {
      await message.reply(`engine: ${engine.alive ? 'alive' : 'restarting'}, queue: ${queueLength}, ${showConfig()}`);
      return;
    }

    if (!message.content.startsWith('!fight')) return;
    const arg = message.content.slice('!fight'.length);
    try {
      checkAccess(message);
      const chars = parseFightCommand(arg, roster);
      checkUserThrottle(message);
      await message.channel.sendTyping();
      const { path: gifPath, winner } = await enqueueFight(() => renderFight(chars, Math.floor(Math.random() * 1e6)));
      const attachment = new AttachmentBuilder(gifPath);
      await message.reply({ content: `${chars.join(' vs ')} — winner: ${winner.chars.join(', ')}`, files: [attachment] });
    } catch (err) {
      await message.reply(`couldn't run that fight: ${err.message}`);
    }
  });

  client.once('ready', () => console.log(`logged in as ${client.user.tag}`));
  await client.login(TOKEN);
}

main().catch(err => { console.error(err); process.exit(1); });
