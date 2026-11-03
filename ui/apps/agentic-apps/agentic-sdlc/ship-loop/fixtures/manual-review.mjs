let fixture;
export const setFixture = (value) => { fixture = value; };
export const repositoryContext = (...args) => fixture.repositoryContext(...args);
export const reviewBindings = (...args) => fixture.reviewBindings(...args);
export const platformRequest = (...args) => fixture.platformRequest(...args);
export class SetupError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
