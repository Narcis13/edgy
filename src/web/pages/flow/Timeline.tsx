// The timeline: the composer, what today holds, and every item as a post by
// its last activity, under one heading per day, with reactions and comments.

import { type RefObject, useMemo, useState } from 'react';
import { AlarmClock, CheckCircle2, Heart, Lightbulb, MessageCircle, PartyPopper, Pin, Play, Search, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import {
  type Filter, type FlowComment, type Post as PostData, type ReactionKind, REACTIONS, dayLabel, durationLabel, feedOf, minutesOn, postsOf, reactionCounts, tagsOf, timeLabel, todayOf,
} from '../../../core/flow';
import { timeAgo } from '../../lib/api';
import { Avatar } from '../../account/Avatar';
import { cx, plural } from '../library/text';
import { Composer } from './Composer';
import { ClockBadge, DocLink, DoneBox, ItemMenu, KindBadge, PriorityMark, Tags, When, WhoLine, colorOf } from './bits';
import type { ViewProps } from './FlowPage';
import { quiet } from './state';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'task', label: 'Tasks' },
  { id: 'event', label: 'Events' },
  { id: 'done', label: 'Done' },
];

const REACTION_ICON: Record<ReactionKind, React.ReactNode> = {
  like: <ThumbsUp size={14} aria-hidden="true" />,
  dislike: <ThumbsDown size={14} aria-hidden="true" />,
  love: <Heart size={14} aria-hidden="true" />,
  party: <PartyPopper size={14} aria-hidden="true" />,
  idea: <Lightbulb size={14} aria-hidden="true" />,
};

export function Timeline(props: ViewProps & { composer: RefObject<HTMLTextAreaElement | null> }) {
  const { data, today, now, acts, openItem, composer } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const posts = useMemo(() => postsOf(data), [data]);
  const feed = useMemo(() => feedOf(posts, today, filter, query, tag), [posts, today, filter, query, tag]);
  const tags = useMemo(() => tagsOf(data.items), [data.items]);
  const t = useMemo(() => todayOf(data.items, today), [data.items, today]);
  const pickTag = (x: string) => setTag((cur) => (cur === x ? null : x));
  const total = feed.reduce((n, d) => n + d.posts.length, 0);

  return (
    <div className="flow-timeline">
      <Composer acts={acts} today={today} inputRef={composer} />

      <section className="flow-today" aria-label="Today">
        <h2>Today <span className="lib-n">{new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></h2>
        {!t.events.length && !t.due.length && !t.overdue.length && !t.running && !t.doneToday ? (
          <p className="flow-today-quiet">A quiet day so far. Post what is on your mind, or give a task a day.</p>
        ) : (
          <ul className="flow-today-list">
            {t.running && (
              <li className="flow-today-item is-running">
                <button type="button" className="flow-today-btn" onClick={() => openItem(t.running!.id)}>
                  <Play size={13} aria-hidden="true" /><span className="flow-today-text">{t.running.text}</span><span className="flow-today-side">{durationLabel(minutesOn(t.running, now))} on the clock</span>
                </button>
                <button type="button" className="btn small ghost" onClick={() => quiet(acts.clock(t.running!.id, false))}>Stop</button>
              </li>
            )}
            {t.events.map((e) => (
              <li key={e.id} className="flow-today-item">
                <button type="button" className="flow-today-btn" onClick={() => openItem(e.id)}>
                  <span className="flow-today-time">{timeLabel(e.start, e.end)}</span><span className="flow-today-text">{e.text}</span>
                </button>
              </li>
            ))}
            {t.due.map((e) => (
              <li key={e.id} className="flow-today-item">
                <DoneBox item={e} onChange={(done) => quiet(acts.patch(e.id, { done }))} />
                <button type="button" className="flow-today-btn" onClick={() => openItem(e.id)}><span className="flow-today-text">{e.text}</span><span className="flow-today-side">due today</span></button>
              </li>
            ))}
            {t.overdue.length > 0 && (
              <li className="flow-today-item is-late">
                <button type="button" className="flow-today-btn" onClick={() => setFilter('task')}>
                  <AlarmClock size={13} aria-hidden="true" /><span className="flow-today-text">{plural(t.overdue.length, 'task')} overdue: {t.overdue.slice(0, 3).map((i) => i.text).join(', ')}{t.overdue.length > 3 ? '…' : ''}</span>
                </button>
              </li>
            )}
            {t.doneToday > 0 && (
              <li className="flow-today-item is-done">
                <button type="button" className="flow-today-btn" onClick={() => setFilter('done')}><CheckCircle2 size={13} aria-hidden="true" /><span className="flow-today-text">{plural(t.doneToday, 'task')} finished today</span></button>
              </li>
            )}
          </ul>
        )}
      </section>

      <div className="flow-tools">
        <div className="lib-filters flow-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={cx('lib-chip', filter === f.id && 'is-on')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <label className="lib-search flow-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} placeholder="Search posts (/)" aria-label="Search posts" onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); } }} />
          {query && <button type="button" className="icon-btn" aria-label="Clear the search" onClick={() => setQuery('')}><X size={14} /></button>}
        </label>
      </div>
      {tags.length > 0 && (
        <div className="flow-tagrow" role="group" aria-label="Tags">
          {tags.slice(0, 24).map((x) => (
            <button key={x.tag} type="button" className={cx('flow-tag', tag === x.tag && 'is-on')} aria-pressed={tag === x.tag} onClick={() => pickTag(x.tag)}>#{x.tag} <span className="lib-n">{x.count}</span></button>
          ))}
        </div>
      )}

      <div className="flow-feed" aria-label="Posts">
        {!data.items.length ? (
          <div className="lib-empty">
            <b>Nothing here yet.</b>
            <span>Write the first post above. A line like <code>Call Ben tomorrow 3pm #sales</code> becomes an event; <code>todo Write the report</code> a task on the board.</span>
          </div>
        ) : !total ? (
          <p className="home-empty">Nothing matches.</p>
        ) : feed.map((day) => (
          <section key={day.day} className="flow-day">
            <h2 className="flow-day-head">{day.label}<span className="lib-n">{day.posts.length}</span></h2>
            {day.posts.map((p) => <Post key={p.item.id} post={p} props={props} pickTag={pickTag} tag={tag} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

function Post({ post, props, pickTag, tag }: { post: PostData; props: ViewProps; pickTag: (t: string) => void; tag: string | null }) {
  const { data, today, now, acts, openItem, confirm, navigate } = props;
  const { item } = post;
  const [menu, setMenu] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const counts = reactionCounts(post.reactions, data.me);
  const comments = showAll || post.comments.length <= 3 ? post.comments : post.comments.slice(-3);
  const doneAt = item.done && item.doneAt ? `done ${timeAgo(item.doneAt, now)}` : null;
  return (
    <article className={cx('post', `is-${item.kind}`, item.done && 'is-done', menu && 'is-menu', item.by.kind === 'agent' && 'is-agent')} aria-label={item.text}>
      <header className="post-head">
        <WhoLine who={item.by} at={<><time dateTime={new Date(item.posted).toISOString()} title={new Date(item.posted).toLocaleString()}>{timeAgo(item.posted, now)}</time>{doneAt && <> · {doneAt}</>}</>} />
        <div className="post-marks">
          {item.pinned && <span className="badge pin" title="Pinned"><Pin size={11} aria-hidden="true" /></span>}
          <PriorityMark priority={item.priority} />
          <KindBadge kind={item.kind} />
          <ItemMenu item={item} deps={{ acts, openItem, confirm }} onOpenChange={setMenu} />
        </div>
      </header>
      <div className="post-body">
        {item.kind === 'task' && <DoneBox item={item} onChange={(done) => quiet(acts.patch(item.id, { done }))} />}
        <div className="post-words">
          <button type="button" className="post-text" onClick={() => openItem(item.id)}>{item.text || <span className="faint">(no title)</span>}</button>
          {item.body && <p className="post-more">{item.body}</p>}
        </div>
      </div>
      {(item.tags.length > 0 || item.due || item.start || item.doc || item.spent || item.clock) && (
        <div className="post-meta">
          <When item={item} today={today} />
          <Tags tags={item.tags} onPick={pickTag} picked={tag} />
          {item.doc && <DocLink id={item.doc} title={data.docs[item.doc] ?? ''} navigate={navigate} />}
          <ClockBadge item={item} now={now} />
        </div>
      )}
      <div className="post-react" role="group" aria-label="Reactions">
        {REACTIONS.map((r) => {
          const c = counts.find((x) => x.kind === r.kind);
          return (
            <button key={r.kind} type="button" className={cx('post-reaction', c?.mine && 'is-mine', c && 'has-count')} aria-pressed={!!c?.mine}
              aria-label={`${r.label}${c ? `, ${c.count}` : ''}`} title={c ? `${r.label}: ${c.names.join(', ')}` : r.label}
              onClick={() => quiet(acts.react(item.id, r.kind))}>
              {REACTION_ICON[r.kind]}{c && <span className="post-reaction-n">{c.count}</span>}
            </button>
          );
        })}
        <span className="post-comments-n"><MessageCircle size={14} aria-hidden="true" />{post.comments.length ? plural(post.comments.length, 'comment') : 'No comments'}</span>
      </div>
      {post.comments.length > 3 && !showAll && (
        <button type="button" className="link-btn post-more-comments" onClick={() => setShowAll(true)}>Show all {post.comments.length} comments</button>
      )}
      {comments.length > 0 && (
        <ul className="post-comments">
          {comments.map((c) => <Comment key={c.id} comment={c} props={props} />)}
        </ul>
      )}
      <CommentBox itemId={item.id} props={props} />
    </article>
  );
}

function Comment({ comment, props }: { comment: FlowComment; props: ViewProps }) {
  const { now, acts, confirm } = props;
  return (
    <li className={cx('post-comment', comment.by.kind === 'agent' && 'is-agent')}>
      <Avatar name={comment.by.name} color={colorOf(comment.by)} size={24} />
      <div className="post-comment-bubble">
        <span className="post-comment-who"><b>{comment.by.name}</b>{comment.by.kind === 'agent' && <span className="chip agent">for {comment.by.for ?? 'you'}</span>}<time dateTime={new Date(comment.posted).toISOString()}>{timeAgo(comment.posted, now)}</time></span>
        <span className="post-comment-text">{comment.text}</span>
      </div>
      <button type="button" className="icon-btn post-comment-x" aria-label="Delete this comment"
        onClick={() => confirm({ title: 'Delete this comment?', body: comment.text.slice(0, 120), action: 'Delete', run: () => acts.uncomment(comment.id).catch(() => undefined) })}><X size={13} /></button>
    </li>
  );
}

function CommentBox({ itemId, props }: { itemId: string; props: ViewProps }) {
  const { data, acts } = props;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await acts.comment(itemId, text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="post-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <Avatar name={data.me.name} color={colorOf(data.me)} size={24} />
      <textarea className="text-field post-write-text" rows={1} value={text} placeholder="Write a comment…" aria-label="Write a comment"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <button type="submit" className="btn small soft" disabled={!text.trim() || busy}>Send</button>
    </form>
  );
}
