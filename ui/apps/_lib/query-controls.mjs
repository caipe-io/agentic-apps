/** Bind ordinary dashboard controls to the shared host-owned query history. */
export function bindQueryControls({ host = window, appId, appPath, fields, onRestore = () => {}, onInvalid = () => {} }, createNavigation) {
  let restoring = false, editing = null;
  const controls = fields.map(field => {
    const node = host.document.getElementById(field.id);
    return { ...field, node, fallback: node.type === "checkbox" ? node.checked : node.value };
  });
  function restore(search, initial = false) {
    const params = new URLSearchParams(search);
    let valid = true;
    const changed = [];
    restoring = true;
    for (const field of controls) {
      const { node, name, fallback } = field;
      const previous = node.type === "checkbox" ? node.checked : node.value;
      const value = params.get(name);
      if (node.type === "checkbox") node.checked = value === null ? fallback : value === "1";
      else if (value === null) node.value = fallback;
      else if (value.length > (field.maxLength || 256) || (node.tagName === "SELECT" && !Array.from(node.options).some(option => option.value === value))) {
        node.value = fallback; valid = false;
      } else node.value = value;
      if (previous !== (node.type === "checkbox" ? node.checked : node.value)) changed.push(node);
    }
    // Run the existing rendering/invalidation handlers without generating history.
    for (const node of changed) node.dispatchEvent(new host.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    restoring = false; editing = null;
    if (!valid) onInvalid("The link contains a selection that is unavailable in this app.");
    onRestore({ initial, valid, params });
  }
  const navigation = createNavigation({ host, appId, appPath, restore });
  function commit(mode = "push") {
    if (restoring) return;
    const params = new URLSearchParams(host.location.search);
    for (const { name, node, fallback } of controls) {
      const value = node.type === "checkbox" ? node.checked : node.value;
      if (value === false || value === "") params.delete(name);
      else params.set(name, node.type === "checkbox" ? "1" : value);
    }
    navigation.commit(params.toString(), mode);
  }
  const cleanup = [];
  for (const { node } of controls) {
    const text = node.type === "search" || node.type === "text";
    const changed = () => {
      if (restoring) return;
      commit(text && editing === node ? "replace" : "push");
      editing = text ? node : null;
    };
    const end = () => { editing = null; };
    const event = text ? "input" : "change";
    node.addEventListener(event, changed); node.addEventListener("blur", end);
    cleanup.push(() => { node.removeEventListener(event, changed); node.removeEventListener("blur", end); });
  }
  restore(host.location.search, true);
  return { commit, dispose() { navigation.dispose(); cleanup.forEach(fn => fn()); } };
}
