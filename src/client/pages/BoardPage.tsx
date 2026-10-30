import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { dropPosition, positionBetween, type Board, type Card, type List, type User } from "../../shared/types/index.ts";
import { InlineForm } from "../components/InlineForm.tsx";
import { CardModal } from "../features/cards/CardModal.tsx";
import { createCard, createList, deleteList, getBoard, renameBoard, updateCard, updateList } from "../lib/data.ts";
import { report, subscribe } from "../lib/supabase.ts";

type Drag = { type: "card" | "list"; id: string } | null;

const byPosition = <T extends { position: number }>(xs: T[]) => xs.toSorted((a, b) => a.position - b.position);

export function BoardPage({ id, user }: { id: string; user: User }) {
  const [board, setBoard] = useState<Board | null>();
  const [openCard, setOpenCard] = useState<string | null>(null);
  const drag = useRef<Drag>(null);

  const load = useCallback(() => getBoard(id).then(setBoard, () => setBoard(null)), [id]);
  const closeCard = useCallback(() => setOpenCard(null), []);

  useEffect(() => {
    load();
    return subscribe(`board:${id}`, "changed", load, load);
  }, [id, load]);

  if (board === undefined) return null;
  if (board === null) return <main className="home"><p>Board not found.</p></main>;

  // Optimistic local update; the database's board broadcast re-syncs everyone.
  function moveCard(cardId: string, listId: string, position: number) {
    setBoard((b) => {
      if (!b) return b;
      const card = b.lists.flatMap((l) => l.cards).find((c) => c.id === cardId)!;
      return {
        ...b,
        lists: b.lists.map((l) => ({
          ...l,
          cards: byPosition([...l.cards.filter((c) => c.id !== cardId), ...(l.id === listId ? [{ ...card, listId, position }] : [])]),
        })),
      };
    });
    updateCard(cardId, { listId, position }).catch((e) => (report(e), load()));
  }

  function dropCard(e: DragEvent, list: List, targetCardId?: string) {
    const d = drag.current;
    if (d?.type !== "card" || d.id === targetCardId) return;
    e.preventDefault();
    e.stopPropagation();
    moveCard(d.id, list.id, dropPosition(list.cards, d.id, targetCardId));
  }

  function dropList(e: DragEvent, targetListId: string) {
    const d = drag.current;
    if (d?.type !== "list" || d.id === targetListId || !board) return;
    e.preventDefault();
    const position = dropPosition(board.lists, d.id, targetListId);
    setBoard({ ...board, lists: byPosition(board.lists.map((l) => (l.id === d.id ? { ...l, position } : l))) });
    updateList(d.id, { position }).catch((e) => (report(e), load()));
  }

  const allowDrop = (type: "card" | "list") => (e: DragEvent) => {
    if (drag.current?.type === type) e.preventDefault();
  };

  const rename = (save: (title: string) => Promise<unknown>, current: string) => (value: string) => {
    const title = value.trim();
    if (title && title !== current) save(title).catch(report);
  };

  return (
    <main className="board">
      <input
        key={board.title}
        className="board-title"
        defaultValue={board.title}
        aria-label="Board title"
        onBlur={(e) => rename((title) => renameBoard(id, title), board.title)(e.target.value)}
      />
      <div className="lists">
        {board.lists.map((list) => (
          <section
            key={list.id}
            className="list"
            onDragOver={(e) => {
              allowDrop("list")(e);
              allowDrop("card")(e);
            }}
            onDrop={(e) => (drag.current?.type === "list" ? dropList(e, list.id) : dropCard(e, list))}
          >
            <header
              draggable
              onDragStart={() => (drag.current = { type: "list", id: list.id })}
              onDragEnd={() => (drag.current = null)}
            >
              <input
                key={list.title}
                defaultValue={list.title}
                aria-label="List title"
                onBlur={(e) => rename((title) => updateList(list.id, { title }), list.title)(e.target.value)}
              />
              <button
                aria-label={`Delete list ${list.title}`}
                onClick={() => confirm(`Delete list "${list.title}" and its cards?`) && deleteList(list.id).catch(report)}
              >
                ×
              </button>
            </header>
            <ol className="cards">
              {list.cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  onOpen={() => setOpenCard(card.id)}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    drag.current = { type: "card", id: card.id };
                  }}
                  onDragEnd={() => (drag.current = null)}
                  onDragOver={allowDrop("card")}
                  onDrop={(e) => dropCard(e, list, card.id)}
                />
              ))}
            </ol>
            <InlineForm
              placeholder="Add a card"
              button="Add"
              onSubmit={(title) => createCard(list.id, title, positionBetween(list.cards.at(-1)?.position)).catch(report)}
            />
          </section>
        ))}
        <section className="list new-list">
          <InlineForm placeholder="Add a list" button="Add" onSubmit={(title) => createList(id, title, positionBetween(board.lists.at(-1)?.position)).catch(report)} />
        </section>
      </div>
      {openCard && <CardModal key={openCard} cardId={openCard} boardId={id} lists={board.lists} user={user} onClose={closeCard} />}
    </main>
  );
}

type TileProps = {
  card: Card;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

function CardTile({ card, onOpen, ...dnd }: TileProps) {
  const overdue = card.dueDate && new Date(card.dueDate) < new Date();
  return (
    <li draggable {...dnd}>
      <button className="card" onClick={onOpen}>
        {card.title}
        <span className="card-meta">
          {card.description && <span title="Has description">≡</span>}
          {card.dueDate && (
            <span className={overdue ? "due overdue" : "due"}>
              {new Date(card.dueDate).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" })}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
