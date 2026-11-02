import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Code,
  ErrorMessage,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Link,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  Toggle,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const FIELD_ERRORS = {
  appId: 'Enter the App ID from your Hibira app page.',
  key: 'Enter the Key from your Hibira app page.',
  secret: 'Enter the app secret.',
  host: 'Use ws.hibira.io or your cluster host on hibira.io.',
  projectChannel: 'Use letters, numbers and _ - = @ , . ; plus {projectKey} or {issueKey}.',
  channels: 'Turn on at least one channel.',
};

function Field({ id, label, help, error, children }) {
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      {children}
      {error ? <ErrorMessage>{error}</ErrorMessage> : help ? <HelperMessage>{help}</HelperMessage> : null}
    </Stack>
  );
}

function App() {
  const [settings, setSettings] = useState(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke('getSettings').then((r) => {
      setSettings({ ...r.settings, projects: r.settings.projects.join(', ') });
      setHasSecret(r.hasSecret);
    });
  }, []);

  if (!settings) return <Spinner label="Loading" />;

  const set = (k) => (e) => setSettings({ ...settings, [k]: e.target.value });
  const flip = (k) => (e) => setSettings({ ...settings, [k]: e.target.checked });
  const err = (k) => (errors.includes(k) ? FIELD_ERRORS[k] : undefined);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    const r = await invoke('saveSettings', { settings, secret });
    setBusy(false);
    setErrors(r.ok ? [] : r.errors);
    if (r.ok) {
      setSecret('');
      setHasSecret(true);
      setSettings({ ...r.settings, projects: r.settings.projects.join(', ') });
      setNotice({ appearance: 'success', text: 'Saved. Issue changes now go to Hibira.' });
    }
  };

  const test = async () => {
    setBusy(true);
    setNotice(null);
    const r = await invoke('sendTest');
    setBusy(false);
    setNotice(
      r.ok
        ? { appearance: 'success', text: `Sent hibira-test to ${r.channels.join(', ')}. Open the Debug tab of your Hibira app to see it.` }
        : { appearance: 'error', text: r.message || 'Save the settings first.' },
    );
  };

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="medium">Hibira Realtime</Heading>
        <Text>
          Every issue created, updated, deleted or commented on is published to Hibira channels the moment it happens, so your own website, app or wallboard
          can show it live. Create a free app at <Link href="https://hibira.io/portal">hibira.io</Link> and copy its App ID, Key and secret from the app page.
        </Text>
      </Stack>

      {notice && <SectionMessage appearance={notice.appearance}>{notice.text}</SectionMessage>}

      <Box>
        <Stack space="space.200">
          <Heading size="small">Hibira app</Heading>
          <Field id="appId" label="App ID" error={err('appId')}>
            <Textfield id="appId" value={settings.appId} onChange={set('appId')} />
          </Field>
          <Field id="key" label="Key" error={err('key')}>
            <Textfield id="key" value={settings.key} onChange={set('key')} />
          </Field>
          <Field id="secret" label="Secret" error={err('secret')} help={hasSecret ? 'A secret is saved. Leave empty to keep it.' : 'Stored encrypted in Forge storage and never shown again.'}>
            <Textfield id="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasSecret ? '••••••••' : ''} />
          </Field>
          <Field id="host" label="Host" error={err('host')} help="ws.hibira.io unless your app lives in another cluster.">
            <Textfield id="host" value={settings.host} onChange={set('host')} />
          </Field>
        </Stack>
      </Box>

      <Box>
        <Stack space="space.200">
          <Heading size="small">Channels</Heading>
          <Field id="projectChannel" label="Project channel" error={err('projectChannel') || err('channels')} help="Every event of a project. Leave empty to turn off.">
            <Textfield id="projectChannel" value={settings.projectChannel} onChange={set('projectChannel')} />
          </Field>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="issueChannel" isChecked={settings.issueChannel} onChange={flip('issueChannel')} />
            <Label labelFor="issueChannel">Per-issue channel (jira-issue-KEY)</Label>
          </Inline>
          <Text>For a page that follows one ticket, such as a customer’s request status.</Text>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="privateChannels" isChecked={settings.privateChannels} onChange={flip('privateChannels')} />
            <Label labelFor="privateChannels">Private channels</Label>
          </Inline>
          <Text>
            Private channels add the private- prefix, so only users your server authorizes can listen. Use them when issue titles should not be public.
          </Text>
          <Field id="projects" label="Projects" help="Project keys separated by commas, such as SUP, WEB. Empty sends every project.">
            <Textfield id="projects" value={settings.projects} onChange={set('projects')} />
          </Field>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="includeNames" isChecked={settings.includeNames} onChange={flip('includeNames')} />
            <Label labelFor="includeNames">Include people’s names</Label>
          </Inline>
          <Text>Include the assignee and comment author names in events. Off by default, so no personal data leaves Jira.</Text>
        </Stack>
      </Box>

      <Stack space="space.100">
        <Heading size="small">Events</Heading>
        <Text>
          <Code>issue-created</Code>, <Code>issue-updated</Code> (with the changed fields), <Code>issue-deleted</Code> and <Code>comment-added</Code> (with a 280-character excerpt).
        </Text>
      </Stack>

      <ButtonGroup>
        <Button appearance="primary" onClick={save} isDisabled={busy}>
          Save
        </Button>
        <Button onClick={test} isDisabled={busy || !hasSecret}>
          Send test event
        </Button>
      </ButtonGroup>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
