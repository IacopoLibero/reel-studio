import { useState } from "react";
import { groupByDay, monthGrid, weekOf } from "../../src/shared/calendar-grid";
import type { CalendarData, CalendarPost, CalendarSlot } from "../../src/shared/types";

export interface GridProps {
  data: CalendarData;
  view: "week" | "month";
  cursor: string;
  selectedId: string | null;
  onSelect: (p: CalendarPost) => void;
  onFree: (s: CalendarSlot) => void;
  onDrop: (postId: string, s: CalendarSlot) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusText = (p: CalendarPost) => p.busy ?? (p.status === "scheduled" ? "scheduled on Instagram" : p.status === "local" ? "recorded here only" : p.status === "queued" ? "in queue" : "running");

export function PostCard({ post, compact, selected, onSelect }: { post: CalendarPost; compact: boolean; selected: boolean; onSelect: (p: CalendarPost) => void }) {
  const draggable = post.status === "scheduled" && !post.busy;
  return (
    <button
      className={`cal-card ${post.status} ${compact ? "compact" : ""}`} aria-pressed={selected} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", post.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onSelect(post)} title={`${post.reel ? `Reel ${post.reel.n} ${post.reel.name}` : post.captionStart}, ${post.time}, ${statusText(post)}`}
      aria-label={`${post.reel ? `Reel ${post.reel.n}` : "Post"} at ${post.time}, ${statusText(post)}`}
    >
      {post.coverUrl ? <img src={post.coverUrl} alt="" loading="lazy" /> : <span className="ph" />}
      <span style={{ minWidth: 0 }}>
        <div className="t">{post.time}{post.reel?.closing && <span className="badge" style={{ marginLeft: 6, padding: "0 6px" }}>{post.reel.closing}</span>}</div>
        <div className="n">{post.reel ? `${post.reel.n} · ${post.reel.name}` : post.captionStart || "Post"}</div>
        {!compact && (post.busy || post.status !== "scheduled") && <div className="t">{statusText(post)}</div>}
      </span>
    </button>
  );
}

function FreeSlot({ slot, onFree, onDrop }: { slot: CalendarSlot; onFree: (s: CalendarSlot) => void; onDrop: (id: string, s: CalendarSlot) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      className={`cal-free ${over ? "over" : ""}`} onClick={() => onFree(slot)} aria-label={`Free slot at ${slot.time}. Schedule a reel here`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, slot); }}
    >{slot.time} free</button>
  );
}

export function CalendarGrid(p: GridProps) {
  const posts = groupByDay(p.data.posts);
  const slots = groupByDay(p.data.slots.filter((s) => !s.taken));
  const weeks = p.view === "week" ? [weekOf(p.cursor)] : monthGrid(p.cursor);
  const compact = p.view === "month";
  return (
    <div className="cal" role="grid" aria-label="Instagram schedule">
      {DAY_NAMES.map((n) => <div className="cal-head" key={n} role="columnheader">{n}</div>)}
      {weeks.flat().map((day) => {
        const cls = ["cal-day", day === p.data.today ? "today" : "", day < p.data.today ? "past" : "", compact && day.slice(0, 7) !== p.cursor.slice(0, 7) ? "other" : ""].join(" ");
        return (
          <div className={cls} key={day} role="gridcell" aria-label={day}>
            <div className="num">{compact ? Number(day.slice(8)) : `${Number(day.slice(8))}/${day.slice(5, 7)}`}</div>
            {(posts[day] ?? []).map((post) => <PostCard key={post.id} post={post} compact={compact} selected={post.id === p.selectedId} onSelect={p.onSelect} />)}
            {(slots[day] ?? []).map((s) => <FreeSlot key={s.time} slot={s} onFree={p.onFree} onDrop={p.onDrop} />)}
          </div>
        );
      })}
    </div>
  );
}
