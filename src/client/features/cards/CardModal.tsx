import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { positionBetween, type CardDetail, type List, type User } from "../../../shared/types/index.ts";
import { InlineForm } from "../../components/InlineForm.tsx";
import { addComment, deleteAttachment, deleteCard, deleteComment, getCard, updateCard, uploadAttachment } from "../../lib/data.ts";
import { report, subscribe } from "../../lib/supabase.ts";

type Props = { cardId: string; boardId: string; lists: List[]; user: User; onClose: () => void };

export function CardModal({ cardId, boardId, lists, user, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<CardDetail>();

  // Null means someone deleted the card meanwhile.
  const load = useCallback(() => getCard(cardId).then((c) => (c ? setCard(c) : onClose()), report), [cardId, onClose]);

  useEffect(() => {
    dialog.current?.showModal();
    load();
    return subscribe(`board:${boardId}`, "changed", load);
  }, [load, boardId]);

  const save = (patch: Parameters<typeof updateCard>[1]) => updateCard(cardId, patch).catch(report);

  function moveTo(listId: string) {
    const last = lists.find((l) => l.id === listId)?.cards.at(-1);
    save({ listId, position: positionBetween(last?.position) });
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAttachment(cardId, file).catch(report);
  }

  async function remove() {
    if (!confirm("Delete this card?")) return;
    await deleteCard(cardId).catch(report);
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
                <button onClick={() => deleteAttachment(a.id, a.path).catch(report)} aria-label={`Remove ${a.name}`}>×</button>
              </li>
            ))}
          </ul>
          <input type="file" onChange={upload} aria-label="Upload attachment" />

          <h3>Comments</h3>
          <InlineForm placeholder="Write a comment" button="Send" onSubmit={(body) => addComment(cardId, body).catch(report)} />
          <ul className="comments">
            {card.comments.toReversed().map((c) => (
              <li key={c.id}>
                <strong>{c.userName}</strong> <time className="muted">{new Date(c.createdAt).toLocaleString()}</time>
                {c.userId === user.id && (
                  <button className="link" onClick={() => deleteComment(c.id).catch(report)}>delete</button>
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
