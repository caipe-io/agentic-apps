import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { adoptionSnapshotForRepo, fetchAdoptionMetrics, loadAdoptionSnapshots } from "./adoption-metrics.mjs";
import { buildOssRepoMarkdownReport } from "./markdown-report.mjs";

test("adoption uses independent all-time counts and UTC monthly boundaries, marking the current month partial", async () => {
  const queries = [];
  const client = { searchCounts: async values => {
    queries.push(...values);
    return { counts: values.map(query => query.includes("is:merged") ? 24 : query.includes("created:") ? 3 : 35) };
  } };
  const result = await fetchAdoptionMetrics({ client, repo: "example/project", createdAt: "2026-06-17", now: new Date("2026-08-01T00:05:00Z"), authenticated: true });
  assert.equal(result.pullRequestsOpened, 35);
  assert.equal(result.pullRequestsMerged, 24);
  assert.deepEqual(result.monthlyPullRequestsOpened, [
    {month:"2026-06",value:3,partial:false}, {month:"2026-07",value:3,partial:false}, {month:"2026-08",value:3,partial:true},
  ]);
  assert.ok(queries.includes("repo:example/project is:pr created:2026-07-01..2026-07-31"));
  assert.ok(queries.includes("repo:example/project is:pr created:2026-08-01..2026-08-01"));
});

test("failed batch counts remain null across the reporting window, never zero", async () => {
  let requests = 0;
  const client = { searchCounts: async () => {
    requests++;
    return {counts:[],error:"Source unavailable"};
  } };
  const result = await fetchAdoptionMetrics({client,repo:"example/project",createdAt:"2026-06-01",now:new Date("2026-08-01"),authenticated:true});
  assert.equal(result.pullRequestsOpened,null);
  assert.equal(result.pullRequestsMerged,null);
  assert.equal(requests,1);
  assert.equal(result.monthlyPullRequestsOpened.length,3);
  assert.ok(result.monthlyPullRequestsOpened.every(point=>point.value===null));
});

test("public mode does not consume Search API calls; older repositories have a bounded monthly window", async () => {
  let requests=0;
  const client={searchCounts:async queries=>{requests++;return {counts:queries.map(()=>0)};}};
  const args={client,repo:"example/project",createdAt:"2010-01-01",now:new Date("2026-08-15")};
  const publicResult=await fetchAdoptionMetrics({...args,authenticated:false});
  assert.equal(requests,0);assert.equal(publicResult.pullRequestsOpened,null);
  const result=await fetchAdoptionMetrics({...args,authenticated:true});
  assert.equal(result.monthlyPullRequestsOpened.length,18);
  assert.equal(result.monthlyPullRequestsOpened[0].month,"2025-03");
});

test("historical package data is repository-scoped, dated and retained in Markdown with caveats",()=>{
  const snapshots=[{repo:"example/project",asOf:"2026-07-31",source:"Monthly adoption report",metrics:{packageDownloads:1250,legacyPackageDownloads:250,currentPackageDownloads:1000},caveats:["Includes automated and repeated pulls."]}];
  assert.equal(adoptionSnapshotForRepo(snapshots,"EXAMPLE/PROJECT"),snapshots[0]);
  assert.equal(adoptionSnapshotForRepo(snapshots,"example/another"),null);
  const markdown=buildOssRepoMarkdownReport({repo:"example/project",adoption:{pullRequestsOpened:null,monthlyPullRequestsOpened:[{month:"2026-08",value:null,partial:true}],snapshot:snapshots[0]}});
  assert.match(markdown,/2026-07-31/);assert.match(markdown,/Legacy package downloads \| 250/);assert.match(markdown,/automated and repeated pulls/);assert.match(markdown,/2026-08 \(partial\) \| Unavailable/);
});

test("snapshot configuration rejects invalid counts, impossible dates and inconsistent totals",()=>{
  const dir=mkdtempSync(join(tmpdir(),"adoption-test-"));
  const file=join(dir,"snapshots.json");
  const snapshot={repo:"example/project",asOf:"2026-07-31",source:"Monthly report",metrics:{packageDownloads:100},caveats:[]};
  try {
    writeFileSync(file,JSON.stringify([snapshot]));assert.deepEqual(loadAdoptionSnapshots(file),[snapshot]);
    for(const bad of [{...snapshot,asOf:"2026-02-30"},{...snapshot,metrics:{packageDownloads:-1}},{...snapshot,metrics:{packageDownloads:100,legacyPackageDownloads:60,currentPackageDownloads:60}}]){
      writeFileSync(file,JSON.stringify([bad]));assert.throws(()=>loadAdoptionSnapshots(file));
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
