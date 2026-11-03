'use strict';

const crypto = require('node:crypto');

const DEFAULT_HOST = 'ws.hibira.io';
const EVENT_NAMES = {
  'avi:jira:created:issue': 'issue-created',
  'avi:jira:updated:issue': 'issue-updated',
  'avi:jira:deleted:issue': 'issue-deleted',
  'avi:jira:commented:issue': 'comment-added',
};
const CHANNEL_CHARS = /^[A-Za-z0-9_\-=@,.;]+$/;
const MAX_CHANNEL = 164;
const EXCERPT = 280;

function defaults() {
  return {
    appId: '',
    key: '',
    host: DEFAULT_HOST,
    projectChannel: 'jira-{projectKey}',
    issueChannel: true,
    privateChannels: false,
    projects: [],
    includeNames: false,
  };
}

function normalizeSettings(input) {
  const d = defaults();
  const s = { ...d, ...(input || {}) };
  const projects = Array.isArray(s.projects) ? s.projects : String(s.projects || '').split(',');
  return {
    appId: String(s.appId || '').trim(),
    key: String(s.key || '').trim(),
    host: normalizeHost(s.host),
    projectChannel: String(s.projectChannel ?? '').trim(),
    issueChannel: Boolean(s.issueChannel),
    privateChannels: Boolean(s.privateChannels),
    projects: projects.map((p) => String(p).trim().toUpperCase()).filter(Boolean),
    includeNames: Boolean(s.includeNames),
  };
}

function normalizeHost(host) {
  const h = String(host || '')
    .trim()
    .replace(/^(https?|wss?):\/\//, '')
    .replace(/\/+$/, '');
  return h || DEFAULT_HOST;
}

function validateSettings(s, hasSecret) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s.appId)) errors.push('appId');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s.key)) errors.push('key');
  if (!hasSecret) errors.push('secret');
  if (!/^([a-z0-9-]+\.)*hibira\.io$/.test(s.host)) errors.push('host');
  if (!s.projectChannel && !s.issueChannel) errors.push('channels');
  if (s.projectChannel && !CHANNEL_CHARS.test(s.projectChannel.replace(/\{(projectKey|issueKey)\}/g, 'X'))) errors.push('projectChannel');
  return errors;
}

function channelsFor(s, issue) {
  const projectKey = issueProjectKey(issue);
  const prefix = s.privateChannels ? 'private-' : '';
  const out = [];
  if (s.projectChannel && projectKey) {
    out.push(prefix + s.projectChannel.replace(/\{projectKey\}/g, projectKey).replace(/\{issueKey\}/g, issue.key || ''));
  }
  if (s.issueChannel && issue.key) out.push(prefix + 'jira-issue-' + issue.key);
  return [...new Set(out)].filter((c) => CHANNEL_CHARS.test(c) && c.length <= MAX_CHANNEL);
}

function issueProjectKey(issue) {
  const p = issue && issue.fields && issue.fields.project;
  if (p && p.key) return p.key;
  const k = issue && issue.key;
  return k && k.includes('-') ? k.slice(0, k.lastIndexOf('-')) : '';
}

function wanted(s, issue) {
  if (!s.projects.length) return true;
  return s.projects.includes(issueProjectKey(issue).toUpperCase());
}

function person(u, includeNames) {
  if (!u || !includeNames) return undefined;
  return u.displayName || undefined;
}

function issueSummary(issue, s, site) {
  const f = (issue && issue.fields) || {};
  const out = {
    id: issue.id,
    key: issue.key,
    project: issueProjectKey(issue),
    summary: f.summary,
    status: f.status && f.status.name,
    statusCategory: f.status && f.status.statusCategory && f.status.statusCategory.key,
    priority: f.priority && f.priority.name,
    type: f.issuetype && f.issuetype.name,
    assignee: person(f.assignee, s.includeNames),
    url: site && issue.key ? site.replace(/\/+$/, '') + '/browse/' + issue.key : undefined,
  };
  return prune(out);
}

function changes(changelog) {
  const items = (changelog && changelog.items) || [];
  return items
    .filter((i) => !['description', 'Attachment', 'WorklogId'].includes(i.field))
    .slice(0, 10)
    .map((i) => prune({ field: i.field, from: clip(i.fromString, 80), to: clip(i.toString, 80) }));
}

function clip(v, n) {
  if (v == null) return undefined;
  const t = String(v);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function adfText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem'].includes(node.type) ? inner + ' ' : inner;
}

function buildEvent(evt, s, site) {
  const name = EVENT_NAMES[evt && evt.eventType];
  const issue = evt && evt.issue;
  if (!name || !issue || !wanted(s, issue)) return null;
  const channels = channelsFor(s, issue);
  if (!channels.length) return null;
  const data = { issue: issueSummary(issue, s, site) };
  if (name === 'issue-updated') data.changes = changes(evt.changelog);
  if (name === 'comment-added' && evt.comment) {
    data.comment = prune({
      id: evt.comment.id,
      author: person(evt.comment.author, s.includeNames),
      excerpt: clip(adfText(evt.comment.body).replace(/\s+/g, ' ').trim(), EXCERPT),
    });
  }
  return { name, channels, data: JSON.stringify(data) };
}

function prune(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function signedRequest(s, secret, event, now = Date.now()) {
  const body = JSON.stringify(event);
  const path = `/apps/${s.appId}/events`;
  const params = {
    auth_key: s.key,
    auth_timestamp: String(Math.floor(now / 1000)),
    auth_version: '1.0',
    body_md5: crypto.createHash('md5').update(body).digest('hex'),
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHmac('sha256', secret).update(`POST\n${path}\n${query}`).digest('hex');
  return { url: `https://${s.host}${path}?${query}&auth_signature=${signature}`, body };
}

async function publish(fetchFn, s, secret, event) {
  const req = signedRequest(s, secret, event);
  const res = await fetchFn(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: req.body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Hibira answered ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
}

module.exports = {
  DEFAULT_HOST,
  EVENT_NAMES,
  defaults,
  normalizeSettings,
  validateSettings,
  channelsFor,
  buildEvent,
  signedRequest,
  publish,
  adfText,
};
