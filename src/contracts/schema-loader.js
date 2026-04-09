import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT_SCHEMA_RELATIVE = 'docs/schemas/events/v1/event.schema.json';

function listJsonFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

export function createAjvEventValidator({ cwd = process.cwd() } = {}) {
  const schemaRoot = path.resolve(cwd, 'docs/schemas/events/v1');
  const schemaFiles = listJsonFiles(schemaRoot);

  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
    discriminator: false,
  });
  addFormats(ajv);

  for (const filePath of schemaFiles) {
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    ajv.addSchema(schema);
  }

  const rootSchemaPath = path.resolve(cwd, ROOT_SCHEMA_RELATIVE);
  const rootSchema = JSON.parse(fs.readFileSync(rootSchemaPath, 'utf8'));
  const validate = ajv.getSchema(rootSchema.$id);

  if (typeof validate !== 'function') {
    throw new Error(`Could not resolve root schema validator for id ${rootSchema.$id}`);
  }

  return {
    ajv,
    validate,
    schemaFiles,
  };
}
