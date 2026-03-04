import { createAjvEventValidator } from './schema-loader.js';
import { HttpError } from './errors.js';

export class EventValidator {
  constructor(options = {}) {
    const { validate } = createAjvEventValidator(options);
    this.validateFn = validate;
  }

  validate(event) {
    const ok = this.validateFn(event);
    if (ok) {
      return;
    }

    throw new HttpError(422, 'Event payload does not match contract schema', {
      ajvErrors: this.validateFn.errors ?? []
    });
  }
}
