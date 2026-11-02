let fixture;

export function setFixture(value) {
  if (fixture) throw new Error("Review dispatch fixture is already configured");
  fixture = value;
}

export function resetFixture() {
  fixture = undefined;
}

export const getAgenticSdlcEventsCollection = (...args) =>
  fixture.getAgenticSdlcEventsCollection(...args);
export const managedReviewTask = (...args) => fixture.managedReviewTask(...args);
export const reviewBindings = (...args) => fixture.reviewBindings(...args);
export const openReviewSecret = (...args) => fixture.openReviewSecret(...args);
