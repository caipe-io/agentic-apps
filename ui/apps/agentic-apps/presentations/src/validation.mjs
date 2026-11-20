// Only deliberate, input-safe validation messages cross the tool boundary.
export class DeckValidationError extends Error {
  constructor(code, message, suggestion, path = []) {
    super(message);
    this.code = code;
    this.suggestion = suggestion;
    this.path = path;
  }
  at(prefix) {
    return new DeckValidationError(this.code, this.message, this.suggestion, [...prefix, ...this.path]);
  }
}
