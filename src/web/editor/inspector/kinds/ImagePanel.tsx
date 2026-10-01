// A picture: where it comes from, how it fits, and words for people who can't see it.

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadPicture } from '../../../lib/api';
import { TextField } from '../../fields';
import { cx, useSession } from '../../ctx';
import { Chips, Prop } from '../controls';
import type { KindProps } from './types';

export function ImagePanel({ e }: KindProps) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const c = e.cell;
  return (
    <>
      <Prop label="Picture" hint="Upload a file, or paste a link to one.">
        <label className={cx('btn soft file', busy && 'is-busy')}>
          <Upload size={14} /> {busy ? 'Uploading…' : 'Choose a file'}
          <input type="file" accept="image/*" onChange={async (ev) => {
            const f = ev.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try { e.set('src', await uploadPicture(f)); } catch (err) { session.toast(err instanceof Error ? err.message : 'Upload failed.'); } finally { setBusy(false); }
          }} />
        </label>
        <TextField value={c.src ?? ''} label="Picture link" placeholder="https://… or {{url}}" onCommit={(v) => e.set('src', v || null)} />
      </Prop>
      <Prop label="Fit" hint="Cover fills the cell and may crop; Contain shows it whole.">
        <Chips label="Fit" value={c.fit ?? 'cover'} onChange={(v) => e.set('fit', v === 'cover' ? null : v)} options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]} />
      </Prop>
      <Prop label="Description" hint="Read aloud to people who can't see the picture.">
        <TextField value={c.alt ?? ''} label="Description" placeholder="What the picture shows" onCommit={(v) => e.set('alt', v || null)} />
      </Prop>
    </>
  );
}
