export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/room" && request.method === "POST") {
      const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
      return Response.json({ id, url: `${url.origin}/?room=${id}` });
    }
    const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]+)$/);
    if (match) {
      const id = env.ROOMS.idFromName(match[1].toUpperCase());
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map();
    this.videoState = { src: "", currentTime: 0, paused: true, updatedAt: Date.now() };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/state")) return Response.json(this.videoState);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const name = `Гость-${Math.floor(100 + Math.random() * 900)}`;
    this.sessions.set(server, { name });
    server.send(JSON.stringify({ type: "init", name, state: this.videoState, users: this.userList() }));
    this.broadcast({ type: "users", users: this.userList() }, server);
    server.addEventListener("message", event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "chat") {
        const message = { type: "chat", name, text: String(data.text || "").slice(0, 500), at: Date.now() };
        this.broadcast(message);
      } else if (data.type === "sync") {
        this.videoState = {
          src: String(data.src || this.videoState.src).slice(0, 2000),
          currentTime: Math.max(0, Number(data.currentTime) || 0),
          paused: Boolean(data.paused), updatedAt: Date.now()
        };
        this.broadcast({ type: "sync", state: this.videoState }, server);
      } else if (data.type === "rename") {
        this.sessions.set(server, { name: String(data.name || name).slice(0, 24) });
        this.broadcast({ type: "users", users: this.userList() });
      }
    });
    const close = () => {
      this.sessions.delete(server);
      this.broadcast({ type: "users", users: this.userList() });
    };
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }
  userList() { return [...this.sessions.values()].map(s => s.name); }
  broadcast(data, except) {
    const payload = JSON.stringify(data);
    for (const socket of this.sessions.keys()) {
      if (socket !== except) try { socket.send(payload); } catch {}
    }
  }
}
