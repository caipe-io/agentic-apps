import assert from "node:assert/strict";
import test from "node:test";
import { createQueryNavigation } from "./query-navigation.mjs";

test("equivalent URL encoding does not restore or reload a hosted view", () => {
  const listeners = new Map(), sent = []; let restores = 0;
  const parent = { postMessage: message => sent.push(message) };
  const host = { location: new URL("https://example.test/apps/example?repo=example/project&q=hello%20world#details"), parent,
    history: { replaceState() { throw new Error("No local rewrite expected"); } },
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
  };
  const navigation = createQueryNavigation({ host, appId:"example",appPath:"/apps/example",restore:()=>restores++ });
  const receive = data => listeners.get("message")({source:parent,origin:host.location.origin,data:{version:"1.0",appId:"example",...data}});
  receive({type:"caipe.agenticApp.bridge.capabilities.v1",capabilities:{queryNavigation:true}});
  receive({type:"caipe.agenticApp.navigation.v1",href:"/apps/example?repo=example%2Fproject&q=hello+world#details"});
  navigation.commit("repo=example%2Fproject&q=hello+world");
  listeners.get("caipe:microfrontend-initialize")();
  assert.equal(restores,0);
  assert.deepEqual(sent.map(message=>message.type),["caipe.agenticApp.bridge.connect.v1"]);
});
