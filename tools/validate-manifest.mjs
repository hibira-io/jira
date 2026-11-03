import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import yaml from 'js-yaml';

const schema = JSON.parse(readFileSync(new URL('../node_modules/@forge/manifest/out/schema/manifest-schema.json', import.meta.url), 'utf8'));
const manifest = yaml.load(readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
console.log('manifest.yml matches the Forge manifest schema');
