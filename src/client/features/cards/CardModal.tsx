import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { positionBetween, type CardDetail, type List, type User } from "../../../shared/types/index.ts";
import { InlineForm } from "../../components/InlineForm.tsx";
import { api, report } from "../../lib/api.ts";
import { onEvent } from "../../lib/socket.ts";

type Props = { cardId: string; lists: List[]; user: User; onClose: () => void };

export function CardModal({ cardId, lists, user, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<CardDetail>();

  // A 404 means someone deleted the card meanwhile.
  const load = useCallback(() => api<CardDetail>(`/cards/${cardId}`).then(setCard, onClose), [cardId, onClose]);

  useEffect(() => {
    dialog.current?.showModal();
    load();
    return onEvent((e) => {
      if (e.type === "board:changed") load();
    });
  }, [load]);

  const save = (patch: Record<string, unknown>) => api(`/cards/${cardId}`, { method: "PATCH", body: patch }).catch(report);

  function moveTo(listId: string) {
    const last = lists.find((l) => l.id === listId)?.cards.at(-1);
    save({ listId, position: positionBetween(last?.position) });
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    await api(`/cards/${cardId}/attachments`, { form }).catch(report);
  }

  async function remove() {
    if (!confirm("Delete this card?")) return;
    await api(`/cards/${cardId}`, { method: "DELETE" }).catch(report);
    onClose();
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-label={card?.title ?? "Card"}>
      {card && (
        <>
          <header>
            <input
              key={card.title}
              className="card-title"
              defaultValue={card.title}
              aria-label="Card title"
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (title && title !== card.title) save({ title });
              }}
            />
            <button onClick={() => dialog.current?.close()} aria-label="Close">×</button>
          </header>

          <div className="fields">
            <label>
              List
              <select value={card.listId} onChange={(e) => moveTo(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={card.dueDate?.slice(0, 10) ?? ""}
                onChange={(e) => save({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </label>
          </div>

          <label className="block">
            Description
            {/* ponytail: plain textarea; swap for Tiptap when rich text is actually needed. */}
            <textarea
              key={card.description}
              defaultValue={card.description}
              rows={5}
              maxLength={20000}
              onBlur={(e) => e.target.value !== card.description && save({ description: e.target.value })}
            />
          </label>

          <h3>Attachments</h3>
          <ul className="attachments">
            {card.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                <button onClick={() => api(`/attachments/${a.id}`, { method: "DELETE" }).catch(report)} aria-label={`Remove ${a.name}`}>×</button>
              </li>
            ))}
          </ul>
          <input type="file" onChange={upload} aria-label="Upload attachment" />

          <h3>Comments</h3>
          <InlineForm placeholder="Write a comment" button="Send" onSubmit={(body) => api(`/cards/${cardId}/comments`, { body: { body } }).catch(report)} />
          <ul className="comments">
            {card.comments.toReversed().map((c) => (
              <li key={c.id}>
                <strong>{c.userName}</strong> <time className="muted">{new Date(c.createdAt).toLocaleString()}</time>
                {c.userId === user.id && (
                  <button className="link" onClick={() => api(`/comments/${c.id}`, { method: "DELETE" }).catch(report)}>delete</button>
                )}
                <p>{c.body}</p>
              </li>
            ))}
          </ul>

          <footer>
            <button className="danger" onClick={remove}>Delete card</button>
          </footer>
        </>
      )}
    </dialog>
  );
}
