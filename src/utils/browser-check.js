/**
 * Server-side User-Agent checker for strict Google Chrome browser enforcement.
 */
function isChromeUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return false;

  const isEdge = /Edg\/|EdgA\/|EdgiOS\//i.test(ua);
  const isOpera = /OPR\/|Opera\//i.test(ua);
  const isVivaldi = /Vivaldi\//i.test(ua);
  const isYandex = /YaBrowser\//i.test(ua);
  const isSamsung = /SamsungBrowser\//i.test(ua);
  const isUC = /UCBrowser\//i.test(ua);
  const isFirefox = /Firefox\//i.test(ua);
  const isSafari = /Safari\//i.test(ua) && !/Chrome\//i.test(ua);
  const isBrave = /Brave\//i.test(ua);
  const isChromiumOnly = /Chromium\//i.test(ua);

  if (isEdge || isOpera || isVivaldi || isYandex || isSamsung || isUC || isFirefox || isSafari || isBrave || isChromiumOnly) {
    return false;
  }

  return /Chrome\//i.test(ua);
}

module.exports = { isChromeUserAgent };
