// Tutorial: Sharing with a colleague (site/content/tutorials/sharing.md)
// Ada (the owner) is one window on http://127.0.0.1:<port>; Ana (the colleague) is a second window on
// http://localhost:<port>, a different host, so it has its own cookies, like a private window.
// The people with no account open the links in a second browser, with a profile of its own.

import { Editor, OTHER, BASE, PASSWORD, browser, sleep, outDir } from '../lib.mjs';
import { join } from 'node:path';

const run = process.env.REPLAY_RUN ?? '';
const front = (r) => r.p.send('Page.bringToFront');

export default {
  account: null, // Ada signs up through the page, as step 1 says
  ignored: [
    "title (the replay types the page's title; the template has its own name)",
    'size (what splitting a cell leaves: shares of the row or column)',
    'the tree is compared the moment the document is built (steps 3 to 6); steps 7 to 20 then change it on purpose (ticks, notes, who may open it)',
  ],
  async build({ ed, b, result, compareNow }) {
    const out = outDir();
    const adaEmail = `ada${run}@example.test`, anaEmail = `ana${run}@example.test`;
    // The browser may still hold the session another tutorial signed in with: start with no cookies, like a new window.
    await ed.p.send('Network.clearBrowserCookies');
    const ana = await Editor.open(b, { base: OTHER, name: 'ana' });
    ana.steps = ed.steps; // one list of steps, in the order of the page
    let id, link = {};
    const extra = { problems: [] };

    const signUp = async (r, name, email) => {
      await front(r);
      await r.go('/', 1500); // not signed in: the sign-in page
      await r.press('Create an account', 'body');
      await r.waitFor(`location.pathname === '/signup'`);
      const field = (label) => `[...document.querySelectorAll('label.auth-field')].find((l) => l.querySelector('span').innerText.trim().startsWith(${JSON.stringify(label)})).querySelector('input')`;
      for (const [label, value] of [['Name', name], ['Email', email], ['Password', PASSWORD]]) {
        await r.clickEl(field(label));
        await r.type(value, { wait: 100 });
      }
      await r.press('Create account', 'body');
      await r.waitFor(`location.pathname === '/'`, 10000);
      await sleep(1200);
    };

    await ed.step(1, 'Ada: open the app, Create an account: Name Ada Lovelace, Email, Password, Create account', async () => {
      await signUp(ed, 'Ada Lovelace', adaEmail);
      await ed.check('Ada is signed in, on her library', /Documents/.test(await ed.js('document.body.innerText')));
    });
    await ed.step(2, 'A private window next to it, on another host: Create an account: Ana Silva, Email, Password', async () => {
      await signUp(ana, 'Ana Silva', anaEmail);
      await ana.check('Ana is signed in, on her own library', /Documents/.test(await ana.js('document.body.innerText')));
    });

    // A document to share
    await ed.step(3, 'Ada: New document, title Planning notes', async () => {
      await front(ed);
      id = await ed.newDocument();
      await ed.setTitle('Planning notes');
    });
    await ed.step(4, 'Click the empty cell, # Planning notes, Esc, Alt+Down, / Checklist, Title Actions', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Planning notes');
      await ed.key('Escape');
      await ed.split('down');
      await ed.slash('Checklist');
      await ed.setField('Title', 'Actions');
    });
    await ed.step(5, 'Alt+Down, / Long text, Name notes, Label Notes, Placeholder Write what was decided', async () => {
      await ed.split('down');
      await ed.slash('Long text');
      await ed.setField('Name', 'notes');
      await ed.setField('Label', 'Notes');
      await ed.setField('Placeholder', 'Write what was decided');
    });
    await ed.step(6, 'Alt+Down, type Notes so far: {{notes}}, Esc', async () => {
      await ed.split('down');
      await ed.type('Notes so far: {{notes}}');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'Notes so far: {{notes}}' });
    });
    // The finished document, compared with the template before the sharing begins.
    const cookies = (await ed.p.send('Network.getCookies', { urls: [BASE] })).result.cookies;
    const adaCookie = 'edgy_session=' + cookies.find((c) => c.name === 'edgy_session').value;
    await compareNow(id, { cookie: adaCookie });

    // Give Ana access as an editor
    const openShare = async () => {
      await front(ed);
      if (!(await ed.js(`!!document.querySelector('.share-dialog[open]')`))) {
        await ed.mode('Edit');
        await ed.press('Share', '.topbar');
        await ed.waitFor(`document.querySelector('.share-dialog[open]')`);
        await sleep(600);
      }
    };
    await ed.step(7, 'Share in the header: the dialog lists People: Ada, as Owner', async () => {
      await openShare();
      const t = await ed.js(`document.querySelector('.share-dialog').innerText`);
      await ed.check('the dialog lists Ada as Owner', /Ada Lovelace/.test(t) && /Owner/.test(t), t);
    });
    await ed.step(8, 'Add people: Email of their account ana@example.test, Can edit, Add: Ana joins the list', async () => {
      await ed.clickEl(`document.querySelector('#people-email')`);
      await ed.type(anaEmail, { wait: 100 });
      const access = await ed.js(`(() => { const s = document.querySelector('select[aria-label="Access to give"]'); return s.options[s.selectedIndex].text; })()`);
      await ed.check('the access to give is Can edit', /Can edit/.test(access), access);
      await ed.press('Add', '.share-dialog .people');
      await ed.waitFor(`document.querySelector('select[aria-label="Ana Silva\\'s access"]')`);
      const t = await ed.js(`document.querySelector('.share-dialog').innerText`);
      await ed.check('Ana is in the list with a Remove button', /Ana Silva/.test(t) && /Remove/.test(t), t);
      await ed.p.shot(join(out, 'sharing-share-dialog.png'));
    });
    await ed.js(`document.querySelector('.share-dialog').close(); 1`);

    // What Ana sees
    await ed.step(9, 'Ana: the home page, Shared with me: the document is there with Can edit; open it', async () => {
      await front(ana);
      await ana.go('/', 1500);
      await ana.press('Shared with me', 'body');
      await sleep(1000);
      const card = await ana.js(`document.querySelector('main, .home, body').innerText`);
      await ana.check('Planning notes is there, marked Can edit', /Planning notes/.test(card) && /Can edit/.test(card), card);
      await ana.clickEl(`[...document.querySelectorAll('a.lc-link')].find((a) => a.innerText.includes('Planning notes'))`);
      await ana.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
      await sleep(1500);
    });
    await ed.step(10, 'Ana has Edit, Live and Page and Cell details; Ada sees Ana\'s avatar in her header (presence)', async () => {
      const t = await ana.js(`document.querySelector('.topbar').innerText + ' ' + [...document.querySelectorAll('.topbar button, .topbar a')].map((b) => b.title + b.getAttribute('aria-label')).join(' ')`);
      await ana.check('Edit, Live and Page and Cell details are there', /Edit/.test(t) && /Live/.test(t) && /Page/.test(t) && /Cell details/.test(t), t);
      await ana.check('the panel is there', await ana.js(`!!document.querySelector('aside.side.right')`));
      await front(ed);
      await ed.waitFor(`document.querySelector('.presence button[aria-label*="Ana"]')`, 10000);
    });
    await ed.step(11, 'Ana, in Live: ticks an action and types a note; Ada sees both as she makes them, and Activity lists the changes under her name', async () => {
      await front(ana);
      await ana.mode('Live');
      await ana.clickEl(`(${ana.cellExpr({ kind: 'list' })}).querySelectorAll('.klist-item')[1].querySelector('.klist-check')`);
      await ana.typeInCell({ name: 'notes' }, 'Venue booked for Friday');
      await ana.key('Tab');
      await sleep(1000);
      await front(ed);
      await ed.mode('Live');
      await ed.waitFor(`document.querySelector('.sheet').innerText.includes('Notes so far: Venue booked for Friday')`, 10000);
      const done = await ed.js(`window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value[1].done`);
      await ed.check('the tick arrived in Ada\'s window', done === true);
      // Activity
      await ed.clickEl(`document.querySelector('button[title="Activity and messages"]')`);
      await sleep(800);
      const act = await ed.js(`document.querySelector('.activity')?.innerText ?? ''`);
      await ed.check('Activity names Ana', /Ana Silva|Ana/.test(act), act.slice(0, 500));
      await ed.p.shot(join(out, 'sharing-activity.png'));
    });
    await ed.step(12, 'Ana, in Edit, clicks the Notes field; in Ada\'s window, in Edit, that cell is outlined in her colour with her name; clicking her avatar goes to it', async () => {
      await front(ana);
      await ana.mode('Edit');
      await ana.clickCell({ name: 'notes' }, { at: [30, 18] });
      await sleep(2000);
      await ed.js('1');
      await front(ed);
      await ed.mode('Edit');
      await ed.waitFor(`document.querySelector('.remote-sel')`, 10000).catch(async (e) => { await front(ana); await ana.p.shot(process.env.TMPDIR + '/fail-ana.png'); throw new Error(e.message + ' | ana ' + JSON.stringify(await ana.state()) + ' | ada sees ' + (await ed.js(`JSON.stringify(window.edgy.state.people)`)) + ' mode ' + (await ed.state()).mode); });
      const t = await ed.js(`document.querySelector('.remote-sel').innerText + '|' + document.querySelector('.remote-sel').getAttribute('style')`);
      await ed.check('the outline carries her name', /Ana/.test(t), t);
      await ed.clickEl(`document.querySelector('.presence button[aria-label*="Ana"]')`);
      await ed.p.shot(join(out, 'sharing-presence.png'));
    });

    // Make Ana a viewer
    await ed.step(13, 'Ada: Share again; the menu beside Ana\'s name: Can edit to Can view', async () => {
      await openShare();
      await ed.pickIn(`document.querySelector('select[aria-label="Ana Silva\\'s access"]')`, 'Can view');
      await sleep(1000);
    });
    await ed.step(14, 'Ana\'s window, not reloaded: moved to Live, Edit and Cell details gone, header says Can view, the note above the document', async () => {
      await front(ana);
      await ana.waitFor(`window.edgy.state.mode === 'live' && window.edgy.state.role === 'viewer'`, 10000);
      const top = await ana.js(`document.querySelector('.topbar').innerText + ' ' + [...document.querySelectorAll('.topbar button, .topbar a')].map((b) => b.title + ' ' + b.getAttribute('aria-label')).join(' ')`);
      await ana.check('the header says Can view and has no Edit', /Can view/.test(top) && !/\bEdit\b/.test(await ana.js(`document.querySelector('.seg.mode').innerText`)), top);
      await ana.check('Cell details is gone', !/Cell details/.test(top) && !(await ana.js(`!!document.querySelector('aside.side.right')`)));
      const note = await ana.js(`document.querySelector('.viewer-note')?.innerText ?? ''`);
      await ana.check('the note says what she can do', note === 'You can view this document, not change it. What you type here stays in this tab.', note);
      const modes = await ana.js(`document.querySelector('.seg.mode').innerText`);
      await ana.check('she still has Live and Page', /Live/.test(modes) && /Page/.test(modes), modes);
      await ana.p.shot(join(out, 'sharing-ana-viewer.png'));
    });
    await ed.step(15, 'Ana ticks an action: it shows in her window, not in Ada\'s, and is gone when she reloads', async () => {
      await front(ana);
      await ana.clickEl(`(${ana.cellExpr({ kind: 'list' })}).querySelectorAll('.klist-item')[2].querySelector('.klist-check')`);
      await sleep(800);
      const hers = await ana.js(`window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value[2].done`);
      await ana.check('her tick shows in her window', hers === true);
      await front(ed);
      await sleep(1000);
      const his = await ed.js(`window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value[2].done`);
      await ed.check('in Ada\'s window nothing changed', his === false, String(his));
      await front(ana);
      await ana.go(await ana.js('location.pathname'), 1800);
      await ana.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
      const after = await ana.js(`window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value[2].done`);
      await ana.check('after a reload her tick is gone', after === false, String(after));
    });

    // Share a link
    const b2 = await browser(); // a private window: no cookies at all
    extra.b2 = b2;
    const row = (label) => `[...document.querySelectorAll('.share-dialog .share-row')].find((s) => s.querySelector('.share-kind').innerText.trim().startsWith(${JSON.stringify(label)}))`;
    const linkWindow = async (url) => {
      const p = await Editor.open(b2, { base: BASE, name: 'private' });
      await p.go(url, 2000);
      await p.waitFor(`window.edgy && window.edgy.state.status`, 10000).catch(() => {});
      return p;
    };
    await ed.step(16, 'Ada: Share, the Can view row: Make a link; the address appears with a Copy button; press Copy', async () => {
      await front(ed);
      const has = await ed.js(`!!${row('Can view')}.querySelector('.share-link')`);
      if (!has) await ed.clickEl(`${row('Can view')}.querySelector('button')`);
      await ed.waitFor(`${row('Can view')}.querySelector('.share-link input')`);
      link.view = await ed.js(`${row('Can view')}.querySelector('.share-link input').value`);
      await ed.clickEl(`${row('Can view')}.querySelector('.share-link button')`);
      await sleep(500);
      const copied = await ed.js(`${row('Can view')}.querySelector('.share-link button').innerText`);
      await ed.check('the address is a /s/ link and Copy answers Copied', /\/s\//.test(link.view) && /Copied/.test(copied), link.view + ' ' + copied);
    });
    let guest;
    await ed.step(17, 'A second private window (no account): paste the address: Live with a View only badge and the note; no editor', async () => {
      guest = await linkWindow(link.view);
      const t = await guest.js(`document.body.innerText`);
      await guest.check('the badge reads View only', /View only/.test(t), t.slice(0, 600));
      await guest.check('the note says nothing is saved', /You can try the inputs and buttons; nothing you change here is saved\./.test(t), t.slice(0, 600));
      await guest.check('it is Live, with no Edit button', !/\bEdit\b/.test(await guest.js(`[...document.querySelectorAll('.topbar button, .topbar a')].map((b) => b.innerText).join(' ')`)));
      await guest.p.shot(join(out, 'sharing-view-link.png'));
    });
    await ed.step(18, 'Ada: Make a link on the Can edit row too; open it: the badge reads Can edit, and what the person changes is saved and shows in Ada\'s window', async () => {
      await front(ed);
      await ed.clickEl(`${row('Can edit')}.querySelector('button')`);
      await ed.waitFor(`${row('Can edit')}.querySelector('.share-link input')`);
      link.edit = await ed.js(`${row('Can edit')}.querySelector('.share-link input').value`);
      const g2 = await linkWindow(link.edit);
      link.guest2 = g2;
      const t = await g2.js(`document.body.innerText`);
      await g2.check('the badge reads Can edit', /Can edit/.test(t), t.slice(0, 600));
      await g2.typeInCell({ name: 'notes' }, 'Added through the link');
      await g2.key('Tab');
      await sleep(1500);
      await front(ed);
      await ed.waitFor(`window.edgy.state.doc.root.children.find((c) => c.kind === 'text' && /Notes so far/.test(c.text)) && window.edgy.state.doc.root.children.find((c) => c.name === 'notes').value === 'Added through the link'`, 10000);
      await g2.p.shot(join(out, 'sharing-edit-link.png'));
    });
    await ed.step(19, 'Ada: Turn off on the Can edit row: the address now says No longer shared; Make a link makes a different address', async () => {
      await front(ed);
      await ed.clickEl(`${row('Can edit')}.querySelector('button')`);
      await sleep(1000);
      // The owner's own editor is told the link is off, as if it were the guest's: it shows "No document here". Recorded as a defect; the replay reloads the document to go on.
      const ownerSees = await ed.js(`document.body.innerText`);
      if (/No document here/.test(ownerSees)) {
        result.notes.push('DEFECT (app, not changed here): after Turn off on a link, the owner editor window, and the colleague window too (every signed-in window on that document), turns into "No document here" (status unshared) until it is reloaded. The server sends the "unshared" event to every signed-in listener (guestHears in src/server/access.ts returns true for users) and the session (src/web/session.ts, on("unshared")) does not check whose link it was. The guest page does say "No longer shared".');
        await ed.go('/d/' + id, 1800);
        await ed.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
        await openShare();
        await front(ana);
        const seen = await ana.js(`document.body.innerText`);
        if (/No document here/.test(seen)) {
          await ana.go(await ana.js('location.pathname'), 1800);
          await ana.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
        }
        await front(ed);
      }
      const g2 = link.guest2;
      await front(g2);
      await g2.go(link.edit, 1800);
      const t = await g2.js(`document.body.innerText`);
      await g2.check('the page says No longer shared', /No longer shared/.test(t), t.slice(0, 400));
      await g2.p.shot(join(out, 'sharing-link-off.png'));
      await front(ed);
      await ed.clickEl(`${row('Can edit')}.querySelector('button')`);
      await ed.waitFor(`${row('Can edit')}.querySelector('.share-link input')`);
      const again = await ed.js(`${row('Can edit')}.querySelector('.share-link input').value`);
      await ed.check('a new link is a different address', again !== link.edit, again);
      extra.problems.push(...g2.problems, ...guest.problems);
    });

    // Take Ana out
    await ed.step(20, 'Remove beside Ana: in her window, at once, the document is replaced by No longer shared with you and Back to your documents', async () => {
      await front(ed);
      await ed.clickEl(`[...document.querySelectorAll('.share-dialog .people button')].find((b) => /Remove/.test(b.innerText) && b.closest('li, .people-row, div').innerText.includes('Ana'))`);
      await sleep(1500);
      await front(ana);
      await ana.waitFor(`document.body.innerText.includes('No longer shared with you')`, 10000).catch(async (e) => { await ana.p.shot(process.env.TMPDIR + '/fail-ana20.png'); throw new Error(e.message + ' | ana sees: ' + (await ana.js('document.body.innerText.slice(0, 300)')) + ' status ' + (await ana.js('window.edgy?.state.status'))); });
      const t = await ana.js(`document.body.innerText`);
      await ana.check('the message and the button', /No longer shared with you/.test(t) && /Back to your documents/.test(t), t.slice(0, 400));
      await ana.p.shot(join(out, 'sharing-ana-removed.png'));
    });
    b2.close();
    extra.problems.push(...ana.problems);
    return { id, problems: extra.problems, cookie: adaCookie, done: true };
  },
};
