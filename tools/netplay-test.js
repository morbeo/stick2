#!/usr/bin/env node
// Proves the zero-middleware netplay prototype (prototype/netplay.js) actually connects two independent
// browser processes peer to peer. Node only stands in for the human: it reads each side's blob string and
// hands it to the other, exactly as if they'd pasted it into a chat - no signaling server runs anywhere.
// usage: node tools/netplay-test.js
const path = require('path');
const { launch } = require('./chrome');
const netplaySrc = require('fs').readFileSync(path.join(__dirname, '..', 'prototype', 'netplay.js'), 'utf8');

async function main() {
  const host = await launch('about:blank');
  const guest = await launch('about:blank');
  try {
    await host.js(`${netplaySrc}\n true`);
    await guest.js(`${netplaySrc}\n true`);

    await host.js(`(async () => {
      window.received = null;
      const { pc, ch, inviteBlob } = await createInvite({ onMessage: m => { window.received = m; } });
      window.pc = pc; window.ch = ch; window.inviteBlob = inviteBlob;
    })()`);
    const inviteBlob = await host.js('window.inviteBlob');
    console.log('host invite blob: ' + inviteBlob.length + ' chars');

    await guest.js(`(async () => {
      window.received = null;
      const r = await acceptInvite(${JSON.stringify(inviteBlob)}, { onMessage: m => { window.received = m; } });
      window.pc = r.pc; window.getChannel = r.getChannel; window.answerBlob = r.answerBlob;
    })()`);
    const answerBlob = await guest.js('window.answerBlob');
    console.log('guest answer blob: ' + answerBlob.length + ' chars');

    await host.js(`acceptAnswer(window.pc, ${JSON.stringify(answerBlob)})`);

    // wait for both ends to see their channel open
    for (const side of [host, guest]) {
      for (let i = 0; i < 50; i++) {
        const open = await side.js(side === host ? 'window.ch?.readyState' : '(window.getChannel() || {}).readyState');
        if (open === 'open') break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
    const hostOpen = await host.js('window.ch?.readyState');
    const guestOpen = await guest.js('(window.getChannel() || {}).readyState');
    console.log('host channel:', hostOpen, '| guest channel:', guestOpen);
    if (hostOpen !== 'open' || guestOpen !== 'open') throw new Error('channel did not open on both sides');

    await host.js(`window.ch.send(JSON.stringify({ text: "ping from host", t: 1 }))`);
    let reply = null;
    for (let i = 0; i < 50 && !reply; i++) { reply = await guest.js('window.received'); if (!reply) await new Promise(r => setTimeout(r, 100)); }
    console.log('guest received:', JSON.stringify(reply));
    if (reply?.text !== 'ping from host') throw new Error('guest never received the host\'s message');

    await guest.js(`window.getChannel().send(JSON.stringify({ text: "pong from guest", t: 2 }))`);
    let reply2 = null;
    for (let i = 0; i < 50 && !reply2; i++) { reply2 = await host.js('window.received'); if (!reply2) await new Promise(r => setTimeout(r, 100)); }
    console.log('host received:', JSON.stringify(reply2));
    if (reply2?.text !== 'pong from guest') throw new Error('host never received the guest\'s reply');

    console.log('\nPASS: direct browser-to-browser DataChannel, no signaling server, no middleware for the data.');
  } finally {
    host.close(); guest.close();
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
