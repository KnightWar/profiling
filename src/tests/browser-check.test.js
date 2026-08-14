const test = require('node:test');
const assert = require('node:assert/strict');
const { isChromeUserAgent } = require('../utils/browser-check');

test('isChromeUserAgent identifies official Google Chrome user agents', () => {
  const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  assert.equal(isChromeUserAgent(chromeMac), true);
  assert.equal(isChromeUserAgent(chromeWin), true);
});

test('isChromeUserAgent rejects non-Chrome user agents', () => {
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
  const opera = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';
  const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
  const brave = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120.0.0.0';
  const vivaldi = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5.3206.50';

  assert.equal(isChromeUserAgent(edge), false);
  assert.equal(isChromeUserAgent(opera), false);
  assert.equal(isChromeUserAgent(firefox), false);
  assert.equal(isChromeUserAgent(safari), false);
  assert.equal(isChromeUserAgent(brave), false);
  assert.equal(isChromeUserAgent(vivaldi), false);
  assert.equal(isChromeUserAgent(null), false);
  assert.equal(isChromeUserAgent(''), false);
});

test('Exam access code expiration helper detects past timestamps', () => {
  const pastDate = new Date(Date.now() - 60000).toISOString();
  const futureDate = new Date(Date.now() + 60000).toISOString();

  const isExpired = (expiresAt) => expiresAt ? new Date() > new Date(expiresAt) : false;

  assert.equal(isExpired(pastDate), true);
  assert.equal(isExpired(futureDate), false);
  assert.equal(isExpired(null), false);
});
