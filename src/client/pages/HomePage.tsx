import { useCallback, useEffect, useState } from "react";
import type { BoardSummary, Member, Workspace } from "../../shared/types/index.ts";
import { InlineForm } from "../components/InlineForm.tsx";
import { api, report } from "../lib/api.ts";
import { linkTo } from "../lib/router.ts";
import { onEvent } from "../lib/socket.ts";

export function HomePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>();
  const load = useCallback(() => api<Workspace[]>("/workspaces").then(setWorkspaces, report), []);

  useEffect(() => {
    load();
    return onEvent((e) => {
      if (e.type === "notification" && e.notification.type === "workspace:added") load();
    });
  }, [load]);

  const createWorkspace = (name: string) => api("/workspaces", { body: { name } }).then(load, report);

  if (!workspaces) return null;
  return (
    <main className="home">
      {workspaces.map((ws) => (
        <WorkspaceSection key={ws.id} workspace={ws} reload={load} />
      ))}
      <section>
        <h2>New workspace</h2>
        <InlineForm placeholder="Workspace name" button="Create" onSubmit={createWorkspace} />
      </section>
    </main>
  );
}

function WorkspaceSection({ workspace, reload }: { workspace: Workspace; reload: () => void }) {
  const [members, setMembers] = useState<Member[]>();

  const createBoard = (title: string) =>
    api<BoardSummary>("/boards", { body: { workspaceId: workspace.id, title } }).then(reload, report);
  const loadMembers = () => api<Member[]>(`/workspaces/${workspace.id}/members`).then(setMembers, report);
  const addMember = (email: string) =>
    api(`/workspaces/${workspace.id}/members`, { body: { email } }).then(loadMembers, report);

  return (
    <section>
      <h2>{workspace.name}</h2>
      <div className="board-grid">
        {workspace.boards.map((b) => (
          <a key={b.id} href={`/boards/${b.id}`} onClick={linkTo} className="board-tile">
            {b.title}
          </a>
        ))}
        <div className="board-tile new">
          <InlineForm placeholder="New board title" button="Add" onSubmit={createBoard} />
        </div>
      </div>
      <details onToggle={(e) => e.currentTarget.open && !members && loadMembers()}>
        <summary>Members</summary>
        <ul>
          {members?.map((m) => (
            <li key={m.id}>
              {m.name} <span className="muted">{m.email} · {m.role}</span>
            </li>
          ))}
        </ul>
        {workspace.role === "owner" && <InlineForm placeholder="Add member by email" button="Add" onSubmit={addMember} />}
      </details>
    </section>
  );
}
