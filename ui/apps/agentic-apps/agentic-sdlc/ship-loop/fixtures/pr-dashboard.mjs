let fixture;
export function setFixture(value) {
  fixture = value;
}
export function reviewBindings() {
  return { findOne: async () => fixture.binding };
}
export async function getGitHubAccessToken() {
  return "fixture-token-no-network";
}
export class Octokit {
  users = { getAuthenticated: async () => ({ data: { login: "viewer" } }) };
  pulls = {
    list: async () => ({ data: [fixture.pr] }),
    listReviews: async () => ({ data: fixture.reviews }),
    listReviewComments: async () => ({ data: fixture.comments }),
  };
  checks = {
    listForRef: async () => ({ data: { check_runs: [], total_count: 0 } }),
  };
  repos = { getCombinedStatusForRef: async () => ({ data: { statuses: [] } }) };
}
