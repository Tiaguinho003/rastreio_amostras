function cloneMapWithValues(map) {
  const cloned = new Map();
  for (const [key, value] of map.entries()) {
    cloned.set(key, structuredClone(value));
  }
  return cloned;
}

export class InMemoryEventStore {
  constructor() {
    this.samples = new Map();
    this.eventsBySample = new Map();
    this.idempotencyIndex = new Map();
    this.printAttemptIndex = new Map();
    this.eventsById = new Map();
  }

  _cloneState() {
    return {
      samples: cloneMapWithValues(this.samples),
      eventsBySample: cloneMapWithValues(this.eventsBySample),
      idempotencyIndex: new Map(this.idempotencyIndex),
      printAttemptIndex: new Map(this.printAttemptIndex),
      eventsById: cloneMapWithValues(this.eventsById),
    };
  }

  _replaceState(state) {
    this.samples = state.samples;
    this.eventsBySample = state.eventsBySample;
    this.idempotencyIndex = state.idempotencyIndex;
    this.printAttemptIndex = state.printAttemptIndex;
    this.eventsById = state.eventsById;
  }

  transaction(work) {
    const txState = this._cloneState();
    const result = work(txState);
    this._replaceState(txState);
    return result;
  }

  getSample(sampleId) {
    return this.samples.get(sampleId) ?? null;
  }

  getEvents(sampleId) {
    return this.eventsBySample.get(sampleId) ?? [];
  }

  getEventById(eventId) {
    return this.eventsById.get(eventId) ?? null;
  }
}
