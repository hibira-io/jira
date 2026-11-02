# Hibira Realtime for Jira

Push Jira issue changes to your own website, app or wallboard the moment they happen.

A [Forge](https://developer.atlassian.com/platform/forge/) app for Jira Cloud. Every issue that is created, updated, deleted or commented on is published to [Hibira](https://hibira.io) channels, the hosted, Pusher-compatible WebSocket service. Anything that listens with pusher-js, Laravel Echo or one of the [Hibira SDKs](https://hibira.io/guides) updates live, with no polling of the Jira API.

**Use it for**

- **Live request status for customers.** A support portal page subscribes to `jira-issue-SUP-42` and shows "In progress" the second an agent moves the ticket.
- **Wallboards and TV dashboards.** A board page subscribes to `jira-SUP` and re-sorts as issues come in.
- **Your own app's notifications.** Your server listens on a private channel and turns events into push notifications or [inbox](https://hibira.io/guides/inbox) items.

## Install

1. Create a free app at [hibira.io/portal](https://hibira.io/portal) and copy its **App ID**, **Key** and **Secret**.
2. Install **Hibira Realtime** from the Atlassian Marketplace (or deploy it yourself, see below).
3. In Jira, open **Settings → Apps → Hibira Realtime**, paste the three values and press **Save**, then **Send test event**. The event shows in the **Debug** tab of your Hibira app.

## Events

| Event | When | Data |
|---|---|---|
| `issue-created` | an issue is created | `issue` |
| `issue-updated` | fields change | `issue`, `changes` (field, from, to; up to 10, without the description) |
| `issue-deleted` | an issue is deleted | `issue` |
| `comment-added` | a comment is added | `issue`, `comment` (id, 280-character excerpt) |

`issue` holds `id`, `key`, `project`, `summary`, `status`, `statusCategory` (`new`, `indeterminate`, `done`), `priority`, `type` and `url`. Events stay well under the Free plan's 4 KB message size.

## Channels

| Setting | Default | Channel |
|---|---|---|
| Project channel | `jira-{projectKey}` | every event of a project, e.g. `jira-SUP` (`{issueKey}` also works) |
| Per-issue channel | on | `jira-issue-SUP-42` |
| Private channels | off | adds `private-`, so only users your server authorizes can listen |
| Projects | all | only these project keys, e.g. `SUP, WEB` |
| Include people's names | off | adds `assignee` and the comment `author` display names |

Listen in the browser:

```js
const pusher = new Pusher('YOUR_APP_KEY', { wsHost: 'ws.hibira.io', forceTLS: true, cluster: 'hkg' });
pusher.subscribe('jira-issue-SUP-42').bind('issue-updated', ({ issue, changes }) => {
  document.querySelector('#status').textContent = issue.status;
});
```

Add your site's origin to **Allowed origins** on the Hibira app page.

## No app needed: incoming webhook URL

Jira Automation can publish too. In Hibira, open the app's **Settings** tab, **Incoming webhook URL**, pick a channel and event name, and paste the URL into a **Send web request** action (method POST, body *Issue data* or custom JSON). Add `?pick=issue.key,issue.fields.status.name` to keep only the fields you need.

## Privacy and data

- The app reads issues (`read:jira-work`) and sends the fields above to the Hibira host you set (`*.hibira.io` only). Nothing is stored except the settings; the secret is kept with Forge's encrypted secret storage and never shown again.
- People's names are only sent when you turn them on. Account IDs and emails are never sent.

## Develop and deploy

```bash
npm install -g @forge/cli
forge login
forge register          # writes your app id into manifest.yml
forge deploy
forge install --product jira --site your-site.atlassian.net
npm test                # unit tests of src/core.js
npm run validate        # checks manifest.yml against the Forge schema
```

`src/core.js` holds everything that does not need Forge (settings, event building, request signing) and is unit tested; `src/index.js` wires it to Forge triggers, storage and the admin page resolver; `src/frontend/index.jsx` is the UI Kit settings page.

## License

MIT

---

## 中文摘要

Hibira Realtime for Jira 是一個 Forge app：Jira 的工單建立、更新、刪除、留言會即時推到 Hibira 頻道，客戶的網站、App 或看板牆就能立刻更新，不用輪詢 Jira API。在 Jira「設定 → Apps → Hibira Realtime」填入 Hibira 的 App ID、Key、Secret 即可。預設頻道為 `jira-{專案代碼}` 與 `jira-issue-{工單代碼}`，可改成私人頻道、限定專案；人名預設不送出。不想裝 app 的話，也可以在 Hibira Console 產生「傳入 webhook 網址」，直接貼進 Jira Automation 的 Send web request。
