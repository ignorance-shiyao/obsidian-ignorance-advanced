// Desktop integration checks use an Obsidian window explicitly started with its debug port.
export async function connectObsidian() {
  const targets = await (await fetch(`http://127.0.0.1:${process.env.OBSIDIAN_DEBUG_PORT || 9333}/json`)).json();
  const page = targets.find(target => target.type === "page" && target.url.endsWith("index.html"));
  if (!page) throw Error("No Obsidian main window on the debug port");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const requests = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (requests.has(message.id)) { requests.get(message.id)(message); requests.delete(message.id); } };
  const evaluate = async expression => {
    const id = ++serial;
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { requests.delete(id); reject(Error("Obsidian integration check timed out")); }, 120000);
      requests.set(id, result => { clearTimeout(timer); resolve(result); });
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (response.error || response.result?.exceptionDetails) throw Error(JSON.stringify(response.error || response.result.exceptionDetails));
    return response.result?.result?.value;
  };
  return { evaluate, close: () => socket.close() };
}
