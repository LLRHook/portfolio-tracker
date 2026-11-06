// Synthetic HTTP fixture: import the app without running its user seeder.
import assert from 'node:assert/strict';
import session from 'express-session';

assert.ok(process.env.DATABASE_PATH, 'An isolated fixture database is required');
assert.ok(process.env.DOTENV_CONFIG_PATH, 'An empty fixture env file is required');
assert.ok(process.env.SESSION_SECRET, 'A synthetic session secret is required');
const originalGet = session.MemoryStore.prototype.get;
session.MemoryStore.prototype.get = function (id, callback) {
  if (id === 'fixture-a' || id === 'fixture-b') {
    return callback(null, {
      cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: '/' },
      userId: id, username: id,
    });
  }
  originalGet.call(this, id, callback);
};

let holdQuotes = false;
const pendingQuotes = [];
globalThis.fetch = async input => {
  assert.equal(new URL(input).hostname, 'query2.finance.yahoo.com', 'Unexpected outbound request');
  if (holdQuotes) {
    await new Promise(resolve => {
      pendingQuotes.push(resolve);
      process.send({ event: 'quotePending' });
    });
  }
  return Response.json({ chart: { result: [{
    timestamp: [Date.parse('2026-10-21T20:00:00Z') / 1000],
    indicators: { quote: [{ close: [100] }] },
  }] } });
};

const { app } = await import('../server.js');
const { db, getUserCount } = await import('../db.js');
assert.equal(getUserCount(), 0, 'Importing the app must not seed users');
const server = app.listen(0, '127.0.0.1', () => {
  process.send({ event: 'ready', port: server.address().port });
});
process.on('message', message => {
  if (message.command === 'holdQuotes') holdQuotes = true;
  if (message.command === 'releaseQuotes') {
    holdQuotes = false;
    pendingQuotes.splice(0).forEach(resolve => resolve());
  }
  if (message.command === 'close') {
    pendingQuotes.splice(0).forEach(resolve => resolve());
    server.close(() => { db.close(); process.disconnect(); });
  } else {
    process.send({ event: 'ack', id: message.id });
  }
});
