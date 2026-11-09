import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const siteUrl = 'https://trail-desk-security.invalid/index.html';
const sha256 = (value, encoding) => createHash('sha256').update(value).digest(encoding);
const cspHash = value => "'sha256-" + sha256(value, 'base64') + "'";
const noSources = ["'none'"];

// These digests approve the exact filter and sort programs, independently of
// the candidate's self-declared CSP or the builder that produced the HTML.
const approvedScripts = {
  "'sha256-6WxhDBLrHVWmHGCQ3zHPZ22Ri9aWwiPyf17uwgcmhV4='": 'filter',
  "'sha256-9zv/K+b42LOKqRSd+CWG2u81PT2fcpAEEELqZuET7lM='": 'sort',
};

// Run in Chromium using an inert document, before serving the candidate.
function inspectMarkup(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const tags = new Set('html head meta title style body header span h1 p main div strong label input select option section article h2 footer a script'.split(' '));
  const common = new Set(['id', 'class', 'role', 'aria-live', 'aria-label', 'hidden']);
  const attributes = {
    html: ['lang'],
    meta: ['charset', 'name', 'content', 'http-equiv'],
    input: ['type'],
    option: ['value'],
    article: ['data-trail', 'data-step-free', 'data-distance-km'],
    a: ['href'],
  };
  const links = new Set(['architecture.json', 'architecture.c4', 'release.json']);
  const policies = [];
  const scripts = [];
  const styles = [];

  for (const element of document.querySelectorAll('*')) {
    const name = element.localName;
    if ([...element.attributes].some(attribute => attribute.name.startsWith('on'))) {
      return { error: 'inline event handler on ' + name };
    }
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(name)) {
      return { error: 'element ' + name + ' is outside the static site policy' };
    }
    for (const { name: attribute } of element.attributes) {
      const allowedCommon = !['meta', 'script', 'style'].includes(name) && common.has(attribute);
      if (!allowedCommon && !attributes[name]?.includes(attribute)) {
        return { error: 'attribute ' + attribute + ' on ' + name + ' is outside the static site policy' };
      }
    }
    if (name === 'a' && !links.has(element.getAttribute('href'))) {
      return { error: 'link destination is outside the approved release files' };
    }
    if (name === 'input' && element.type !== 'checkbox') {
      return { error: 'only checkbox inputs are permitted' };
    }
    if (name === 'meta') {
      if (element.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy') {
        policies.push(element);
      } else if (!(element.attributes.length === 1 && element.getAttribute('charset')?.toLowerCase() === 'utf-8') &&
                 !(element.attributes.length === 2 && element.getAttribute('name') === 'viewport' && element.hasAttribute('content'))) {
        return { error: 'unexpected meta element' };
      }
    }
    if (name === 'script') scripts.push(element.textContent);
    if (name === 'style') styles.push(element.textContent);
  }
  const earlyPolicy = [...document.head.children].find(element => !element.matches('meta[charset]'));
  if (policies.length !== 1 || policies[0] !== earlyPolicy ||
      policies[0].attributes.length !== 2 || !policies[0].hasAttribute('content')) {
    return { error: 'expected one Content Security Policy before the other head elements' };
  }
  return { policy: policies[0].content, scripts, styles };
}

function checkPolicy({ policy, scripts, styles }) {
  assert.equal(styles.length, 1, 'Website security requires one hash-authorized style element');
  const scriptSources = scripts.map(cspHash);
  const features = scriptSources.map(source => {
    assert.ok(Object.hasOwn(approvedScripts, source), 'Website security found an unreviewed script');
    return approvedScripts[source];
  });
  assert.equal(new Set(features).size, features.length, 'Website security found a duplicate reviewed script');

  const expected = {
    'default-src': noSources,
    'base-uri': noSources,
    'object-src': noSources,
    'form-action': noSources,
    'connect-src': noSources,
    'script-src': scriptSources.length ? scriptSources.sort() : noSources,
    'style-src': styles.map(cspHash),
  };
  const directives = new Map();
  for (const directive of policy.split(';').map(value => value.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(/[\t\n\f\r ]+/);
    assert.ok(!directives.has(name), 'Duplicate Content Security Policy directive ' + name);
    directives.set(name, sources.sort());
  }
  assert.deepEqual(Object.fromEntries(directives), expected, 'Content Security Policy does not match the static site policy');
  return features;
}

// Give Chromium a render cycle to apply CSS and emit attempted resource loads.
const renderFrame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));

async function exercisePage(page, features) {
  const filter = features.includes('filter') ? page.locator('#step-free') : null;
  const order = features.includes('sort') ? page.locator('#distance-sort') : null;
  for (const checked of filter ? [true, false] : [false]) {
    if (filter) {
      await filter.setChecked(checked, { timeout: 5000 });
      await page.evaluate(renderFrame);
    }
    if (order) {
      for (const value of ['shortest', 'longest', 'catalog']) {
        await order.selectOption(value, { timeout: 5000 });
        await page.evaluate(renderFrame);
      }
    }
  }
}

async function probeCsp(page) {
  await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'globalThis.forgeUnexpectedScriptRan = true';
    const style = document.createElement('style');
    style.textContent = 'body { --forge-unexpected-style: true }';
    document.body.append(script, style);
    await fetch('/__forge_csp_probe__').catch(() => {});
  });
  await page.waitForFunction(() => {
    const violations = globalThis.forgeWebsitePolicyViolations;
    return ['script-src-elem', 'style-src-elem', 'connect-src'].every(expected =>
      violations.some(({ directive, disposition }) => directive === expected && disposition === 'enforce'));
  }, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => Boolean(globalThis.forgeUnexpectedScriptRan)), false,
    'Content Security Policy allowed an unauthorized script to run');
}

export async function verifyWebsiteSecurity({ browser, html }) {
  const bytes = Buffer.isBuffer(html) ? html : Buffer.from(html, 'utf8');
  const markup = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
  try {
    const requests = [];
    let delivered = false;
    await context.route('**/*', async route => {
      const request = route.request();
      if (!delivered && request.url() === siteUrl && request.isNavigationRequest() && request.method() === 'GET') {
        delivered = true;
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: bytes });
      } else {
        requests.push(request.resourceType() + ' ' + request.url());
        await route.abort('blockedbyclient');
      }
    });
    await context.addInitScript(() => {
      const violations = [];
      Object.defineProperty(globalThis, 'forgeWebsitePolicyViolations', { value: violations });
      document.addEventListener('securitypolicyviolation', event => violations.push({
        directive: event.effectiveDirective, disposition: event.disposition, uri: event.blockedURI,
      }));
    });
    const page = await context.newPage();
    const inspection = await page.evaluate(inspectMarkup, markup);
    assert.ok(!inspection.error, 'Website security: ' + inspection.error);
    const features = checkPolicy(inspection);

    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(siteUrl, { timeout: 5000 });
    await page.evaluate(renderFrame);
    await exercisePage(page, features);
    const violations = await page.evaluate(() => globalThis.forgeWebsitePolicyViolations);
    assert.deepEqual(violations, [], 'Website resource or code violated the Content Security Policy');
    assert.deepEqual(requests, [], 'Website attempted unexpected network requests');
    assert.deepEqual(errors, [], 'Website raised errors while executing reviewed code');
    assert.equal(page.url(), siteUrl, 'Website unexpectedly navigated');
    assert.equal(page.frames().length, 1, 'Website opened an unexpected frame');
    assert.equal(context.pages().length, 1, 'Website opened an unexpected window');

    const cssRules = await page.evaluate(() => [...document.styleSheets].map(sheet =>
      [...sheet.cssRules].map(rule => rule.cssText).join('\n')));
    assert.equal(cssRules.length, 1, 'Content Security Policy did not authorize the reviewed style');
    assert.doesNotMatch(cssRules[0], /\b(?:url|(?:-webkit-)?image-set)\(|@import\b/i,
      'Website stylesheet contains a resource URL outside the static site policy');
    await probeCsp(page);
    assert.deepEqual(requests, [], 'Website Content Security Policy allowed a network request');

    return {
      policy: 'trail-desk-static-v1',
      siteSha256: sha256(bytes, 'hex'),
      scriptCount: features.length,
      checks: ['static-markup', 'hash-allowlist', 'browser-interactions', 'browser-csp-enforcement'],
    };
  } finally {
    await context.close();
  }
}
