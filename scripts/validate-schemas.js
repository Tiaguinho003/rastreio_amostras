import { createAjvEventValidator } from '../src/contracts/schema-loader.js';

try {
  const { schemaFiles, validate } = createAjvEventValidator();
  if (typeof validate !== 'function') {
    throw new Error('Root event validator could not be compiled');
  }

  console.log(`Schemas loaded: ${schemaFiles.length}`);
  console.log('Schema compilation successful');
} catch (error) {
  console.error('Schema validation bootstrap failed');
  console.error(error);
  process.exitCode = 1;
}
