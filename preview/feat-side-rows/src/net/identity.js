'use strict';
// ---------- identity: one key pair per player, the same on every stick2 server (server/relay.js auth, docs/server.md) ----------
// The app makes an ECDSA P-256 key pair once and keeps it (localStorage). On connecting, a server sends a fresh nonce; the app
// signs it, and the server knows the connection by the public key's id from then on: the device id its accounts, ratings and bans
// go by. Nothing is shared between servers, yet each knows the same key, and nobody can pass for it by copying an id. The key can
// be copied to another device (export / import): that device is then the same player everywhere. Pure logic over Web Crypto.
const NET_IDENTITY = 'stick2-identity';
const IDENTITY = { alg: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' }, prefix: 'stick2-key:' };
const idB64 = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

// the stored pair { pub, priv } (JWKs), made the first time; store: { get(), set(v) } (default localStorage)
async function identityKeys(store = identityStore()) {
  const subtle = globalThis.crypto?.subtle; if (!subtle) return null; // (an insecure page: no Web Crypto, no key)
  let k = null; try { k = JSON.parse(store.get() || 'null'); } catch {}
  if (!k?.pub?.x || !k?.priv?.d) {
    const p = await subtle.generateKey(IDENTITY.alg, true, ['sign', 'verify']);
    k = { pub: await subtle.exportKey('jwk', p.publicKey), priv: await subtle.exportKey('jwk', p.privateKey) };
    store.set(JSON.stringify(k));
  }
  return k;
}
function identityStore() {
  let mem = null;
  return { get: () => { try { return localStorage.getItem(NET_IDENTITY); } catch { return mem; } }, set: v => { try { localStorage.setItem(NET_IDENTITY, v); } catch { mem = v; } } };
}
// the auth message for a server's nonce: { t: 'auth', key (public JWK), sig }
async function identitySign(nonce, keys) {
  const subtle = globalThis.crypto.subtle, { kty, crv, x, y } = keys.pub;
  const priv = await subtle.importKey('jwk', keys.priv, IDENTITY.alg, false, ['sign']);
  const sig = await subtle.sign(IDENTITY.sign, priv, new TextEncoder().encode('stick2-auth:' + nonce));
  return { t: 'auth', key: { kty, crv, x, y }, sig: idB64(sig) };
}
// a short fingerprint people can compare (the same on every server)
const identityPrint = keys => keys ? (keys.pub.x.slice(0, 4) + '-' + keys.pub.y.slice(0, 4)).toUpperCase() : '';
// the pair as one line to carry to another device (secret: whoever has it plays as you), and back
const identityExport = keys => IDENTITY.prefix + btoa(JSON.stringify(keys.priv));
function identityImport(text, store = identityStore()) {
  const s = String(text || '').trim();
  if (!s.startsWith(IDENTITY.prefix)) throw new Error('not a stick2 key');
  let priv; try { priv = JSON.parse(atob(s.slice(IDENTITY.prefix.length))); } catch { throw new Error('that key is damaged'); }
  if (priv?.kty !== 'EC' || priv.crv !== 'P-256' || !priv.d || !priv.x || !priv.y) throw new Error('that key is damaged');
  const keys = { pub: { kty: 'EC', crv: 'P-256', x: priv.x, y: priv.y, ext: true, key_ops: ['verify'] }, priv };
  store.set(JSON.stringify(keys));
  return keys;
}
if (typeof module !== 'undefined') module.exports = { identityKeys, identitySign, identityPrint, identityExport, identityImport, IDENTITY };
