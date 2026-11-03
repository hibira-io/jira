'use strict';

const Resolver = require('@forge/resolver').default;
const api = require('@forge/api').default;
const { route, fetch } = require('@forge/api');
const { kvs } = require('@forge/kvs');
const core = require('./core');

const SETTINGS = 'settings';
const SECRET = 'secret';
const SITE = 'site-url';
const FIELDS = 'summary,status,priority,issuetype,assignee,project';

async function loadSettings() {
  return core.normalizeSettings(await kvs.get(SETTINGS));
}

async function siteUrl() {
  const cached = await kvs.get(SITE);
  if (cached) return cached;
  const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`);
  if (!res.ok) return '';
  const info = await res.json();
  if (info.baseUrl) await kvs.set(SITE, info.baseUrl);
  return info.baseUrl || '';
}

async function withFields(event) {
  const issue = event.issue;
  if (!issue || event.eventType === 'avi:jira:deleted:issue' || (issue.fields && issue.fields.status)) return event;
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.id}?fields=${FIELDS}`);
  if (!res.ok) return event;
  const full = await res.json();
  return { ...event, issue: { ...issue, key: full.key || issue.key, fields: { ...(issue.fields || {}), ...(full.fields || {}) } } };
}

async function onEvent(event) {
  const settings = await loadSettings();
  const secret = await kvs.getSecret(SECRET);
  if (core.validateSettings(settings, Boolean(secret)).length) return;
  const out = core.buildEvent(await withFields(event), settings, await siteUrl());
  if (!out) return;
  try {
    await core.publish(fetch, settings, secret, out);
  } catch (err) {
    console.error('Hibira publish failed', err.status || '', err.message);
  }
}

const resolver = new Resolver();

resolver.define('getSettings', async () => {
  const settings = await loadSettings();
  const secret = await kvs.getSecret(SECRET);
  return { settings, hasSecret: Boolean(secret) };
});

resolver.define('saveSettings', async ({ payload }) => {
  const settings = core.normalizeSettings(payload.settings);
  const newSecret = typeof payload.secret === 'string' ? payload.secret.trim() : '';
  const hasSecret = Boolean(newSecret) || Boolean(await kvs.getSecret(SECRET));
  const errors = core.validateSettings(settings, hasSecret);
  if (errors.length) return { ok: false, errors };
  await kvs.set(SETTINGS, settings);
  if (newSecret) await kvs.setSecret(SECRET, newSecret);
  return { ok: true, settings, hasSecret: true };
});

resolver.define('sendTest', async () => {
  const settings = await loadSettings();
  const secret = await kvs.getSecret(SECRET);
  const errors = core.validateSettings(settings, Boolean(secret));
  if (errors.length) return { ok: false, errors };
  const channels = core.channelsFor(settings, { key: 'TEST-1', fields: { project: { key: 'TEST' } } });
  try {
    await core.publish(fetch, settings, secret, {
      name: 'hibira-test',
      channels,
      data: JSON.stringify({ message: 'Hello from Jira', at: new Date().toISOString() }),
    });
    return { ok: true, channels };
  } catch (err) {
    return { ok: false, errors: ['publish'], message: err.message };
  }
});

exports.onEvent = onEvent;
exports.handler = resolver.getDefinitions();
