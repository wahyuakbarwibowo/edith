import { useCallback, useEffect, useState } from "react";
import type { Member, User, Workspace } from "../../shared/types/index.ts";
import { InlineForm } from "../components/InlineForm.tsx";
import { addMember as rpcAddMember, createBoard as insertBoard, createWorkspace as rpcCreateWorkspace, getMembers, getWorkspaces } from "../lib/data.ts";
import { linkTo } from "../lib/router.ts";
import { report, subscribe } from "../lib/supabase.ts";

export function HomePage({ user }: { user: User }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>();
  const load = useCallback(() => getWorkspaces(user.id).then(setWorkspaces, report), [user.id]);

  // Being added to a workspace arrives as a notification on the user's topic.
  useEffect(() => {
    load();
    return subscribe(`user:${user.id}`, "notification", (n) => n.type === "workspace:added" && load());
  }, [load, user.id]);

  const createWorkspace = (name: string) => rpcCreateWorkspace(name).then(load, report);

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

  const createBoard = (title: string) => insertBoard(workspace.id, title).then(reload, report);
  const loadMembers = () => getMembers(workspace.id).then(setMembers, report);
  const addMember = (email: string) => rpcAddMember(workspace.id, email).then(loadMembers, report);

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
