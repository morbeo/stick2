#!/usr/bin/env node
// A Discord bot that runs "!fight <char> <char> [<char> [<char>]]" (2-4 names, "random" picks one), renders a GIF via tools/mcp.js and posts it.
// usage: DISCORD_BOT_TOKEN=... node tools/discord-bot.js
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error('set DISCORD_BOT_TOKEN');

const SCENARIO_BY_COUNT = { 2: 'ai vs ai', 4: 'ai free-for-all' };

// ---------- a tiny JSON-RPC stdio client for tools/mcp.js ----------
function startEngine() {
  const proc = spawn('node', [path.join(__dirname, 'mcp.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: proc.stdout });
  const pending = new Map();
  let nextId = 1;
  rl.on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const callTool = async (name, args) => {
    const result = await request('tools/call', { name, arguments: args });
    if (result.isError) throw new Error(result.content?.[0]?.text || 'tool error');
    return result;
  };
  const ready = request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stick2-discord-bot', version: '1' } })
    .then(() => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'));
  return { callTool, ready, proc };
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
  if (!SCENARIO_BY_COUNT[names.length]) throw new Error('fights support 2 or 4 fighters right now, not 3');
  return names.map(n => {
    if (n.toLowerCase() === 'random') return roster[Math.floor(Math.random() * roster.length)];
    const match = roster.find(c => c.toLowerCase() === n.toLowerCase());
    if (!match) throw new Error(`no character "${n}" (roster: ${roster.join(', ')})`);
    return match;
  });
}

async function main() {
  await engine.ready;
  const roster = await listCharacterNames();

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!fight')) return;
    const arg = message.content.slice('!fight'.length);
    try {
      const chars = parseFightCommand(arg, roster);
      await message.channel.sendTyping();
      const { path: gifPath, winner } = await renderFight(chars, Math.floor(Math.random() * 1e6));
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
