'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const core = require('../src/core');

const settings = core.normalizeSettings({ appId: 'app_1', key: 'key_1', projects: 'sup, web' });

const issue = {
  id: '10001',
  key: 'SUP-42',
  fields: {
    summary: 'Checkout fails on Safari',
    project: { key: 'SUP' },
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    priority: { name: 'High' },
    issuetype: { name: 'Bug' },
    assignee: { accountId: 'abc', displayName: 'Mei Lin' },
  },
};

test('normalizes settings', () => {
  assert.equal(settings.host, 'ws.hibira.io');
  assert.deepEqual(settings.projects, ['SUP', 'WEB']);
  assert.equal(core.normalizeSettings({ host: 'https://ws-sg.hibira.io/' }).host, 'ws-sg.hibira.io');
});

test('validates settings', () => {
  assert.deepEqual(core.validateSettings(settings, true), []);
  assert.deepEqual(core.validateSettings(settings, false), ['secret']);
  assert.ok(core.validateSettings({ ...settings, host: 'evil.example.com' }, true).includes('host'));
  assert.ok(core.validateSettings({ ...settings, projectChannel: '', issueChannel: false }, true).includes('channels'));
  assert.ok(core.validateSettings({ ...settings, projectChannel: 'bad channel' }, true).includes('projectChannel'));
});

test('builds an issue-updated event with changes and no names by default', () => {
  const out = core.buildEvent(
    {
      eventType: 'avi:jira:updated:issue',
      issue,
      changelog: { items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }, { field: 'description', fromString: 'a', toString: 'b' }] },
    },
    settings,
    'https://acme.atlassian.net/',
  );
  assert.equal(out.name, 'issue-updated');
  assert.deepEqual(out.channels, ['jira-SUP', 'jira-issue-SUP-42']);
  const data = JSON.parse(out.data);
  assert.equal(data.issue.status, 'In Progress');
  assert.equal(data.issue.url, 'https://acme.atlassian.net/browse/SUP-42');
  assert.equal(data.issue.assignee, undefined);
  assert.deepEqual(data.changes, [{ field: 'status', from: 'To Do', to: 'In Progress' }]);
});

test('includes names when allowed, and private channels', () => {
  const s = { ...settings, includeNames: true, privateChannels: true };
  const out = core.buildEvent(
    {
      eventType: 'avi:jira:commented:issue',
      issue,
      comment: { id: '5', author: { displayName: 'Ken' }, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixed in   v2' }] }] } },
    },
    s,
    '',
  );
  assert.equal(out.name, 'comment-added');
  assert.deepEqual(out.channels, ['private-jira-SUP', 'private-jira-issue-SUP-42']);
  const data = JSON.parse(out.data);
  assert.equal(data.issue.assignee, 'Mei Lin');
  assert.deepEqual(data.comment, { id: '5', author: 'Ken', excerpt: 'Fixed in v2' });
});

test('skips other projects and unknown events', () => {
  assert.equal(core.buildEvent({ eventType: 'avi:jira:created:issue', issue: { ...issue, key: 'OPS-1', fields: { project: { key: 'OPS' } } } }, settings, ''), null);
  assert.equal(core.buildEvent({ eventType: 'avi:jira:viewed:issue', issue }, settings, ''), null);
});

test('stays well under the Free plan message size', () => {
  const long = { ...issue, fields: { ...issue.fields, summary: 'x'.repeat(255) } };
  const out = core.buildEvent(
    { eventType: 'avi:jira:commented:issue', issue: long, comment: { id: '1', body: 'y'.repeat(10000) } },
    settings,
    'https://acme.atlassian.net',
  );
  assert.ok(Buffer.byteLength(JSON.stringify(out)) < 4096);
});

test('signs requests like the Pusher HTTP API', () => {
  const event = { name: 'e', channels: ['c'], data: '{}' };
  const req = core.signedRequest(settings, 'secret_1', event, 1700000000000);
  const u = new URL(req.url);
  assert.equal(u.host, 'ws.hibira.io');
  assert.equal(u.pathname, '/apps/app_1/events');
  assert.equal(u.searchParams.get('body_md5'), crypto.createHash('md5').update(req.body).digest('hex'));
  const q = ['auth_key', 'auth_timestamp', 'auth_version', 'body_md5'].map((k) => `${k}=${u.searchParams.get(k)}`).join('&');
  const want = crypto.createHmac('sha256', 'secret_1').update(`POST\n/apps/app_1/events\n${q}`).digest('hex');
  assert.equal(u.searchParams.get('auth_signature'), want);
});

test('publish reports a failed request', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401, text: async () => 'bad signature' };
  };
  await assert.rejects(core.publish(fetchFn, settings, 's', { name: 'e', channels: ['c'], data: '{}' }), /401/);
  assert.equal(calls[0].init.method, 'POST');
});
