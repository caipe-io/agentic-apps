/** One history owner: the platform address bar when embedded, this window otherwise. */
export function createEc2Navigation({ host = window, appPath, restore }) {
  const publicPath = new URL(appPath, host.location.origin).pathname;
  let bridged = false;
  let current = publicPath + host.location.search;
  const local = (href) => {
    const url = new URL(href, host.location.origin);
    host.history.replaceState(null, "", host.location.pathname + url.search + url.hash);
  };
  const send = (type, extra = {}) => host.parent.postMessage({ type, version: "1.0", appId: "ec2", ...extra }, host.location.origin);
  const connect = () => { if (host.parent !== host) send("caipe.agenticApp.bridge.connect.v1"); };
  const receive = (event) => {
    if (host.parent === host || event.source !== host.parent || event.origin !== host.location.origin) return;
    const message = event.data;
    if (!message || message.version !== "1.0" || message.appId !== "ec2") return;
    if (message.type === "caipe.agenticApp.bridge.capabilities.v1") bridged = message.capabilities?.queryNavigation === true;
    if (!bridged || message.type !== "caipe.agenticApp.navigation.v1" || typeof message.href !== "string") return;
    let url;
    try { url = new URL(message.href, host.location.origin); } catch { return; }
    if (url.origin !== host.location.origin || url.pathname !== publicPath) return;
    const href = url.pathname + url.search + url.hash;
    if (href === current) return;
    current = href; local(href); restore(url.search);
  };
  const pop = () => { current = publicPath + host.location.search + host.location.hash; restore(host.location.search); };
  host.addEventListener("message", receive);
  host.addEventListener("popstate", pop);
  host.addEventListener("caipe:microfrontend-initialize", connect);
  connect();
  return {
    commit(search, mode = "push") {
      const href = publicPath + (search ? "?" + search : "");
      if (href === current) return;
      current = href;
      if (bridged) { local(href); send("caipe.agenticApp.navigate.v1", { href, history: mode }); }
      else host.history[mode === "replace" ? "replaceState" : "pushState"](null, "", host.location.pathname + (search ? "?" + search : ""));
    },
    dispose() {
      host.removeEventListener("message", receive);
      host.removeEventListener("popstate", pop);
      host.removeEventListener("caipe:microfrontend-initialize", connect);
    },
  };
}
