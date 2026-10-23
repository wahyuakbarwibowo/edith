import type { ServerEvent } from "../../shared/types/index.ts";

type Listener = (e: ServerEvent) => void;

const listeners = new Set<Listener>();
const boards = new Set<string>();
let ws: WebSocket | null = null;

const emit = (e: ServerEvent) => listeners.forEach((l) => l(e));
const send = (type: "join" | "leave", boardId: string) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, boardId }));
};

function open() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws = socket;
  socket.onopen = () =>
    boards.forEach((id) => {
      send("join", id);
      emit({ type: "board:changed", boardId: id }); // catch up on anything missed while offline
    });
  socket.onmessage = (e) => emit(JSON.parse(e.data));
  socket.onclose = () => {
    if (ws === socket) setTimeout(open, 2000);
  };
}

export function connect() {
  if (!ws) open();
}

export function disconnect() {
  const socket = ws;
  ws = null;
  socket?.close();
}

export function joinBoard(id: string) {
  boards.add(id);
  send("join", id);
  return () => {
    boards.delete(id);
    send("leave", id);
  };
}

export function onEvent(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
