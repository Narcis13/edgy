// The events each kind of cell raises, declared in one place so a dispatcher
// can find them without knowing the kinds. Nothing handles them yet: the
// events brief adds handlers. Until then the web session's `raise` is the one
// place they are fired from, and it does nothing with them.

export interface EventDecl {
  name: string;
  /** What a handler will see bound, in words. */
  data: string;
}

export const KIND_EVENTS: Record<string, EventDecl[]> = {
  tabs: [{ name: 'change', data: 'value: the open tab\'s title; was: the one open before' }],
  accordion: [
    { name: 'open', data: 'title: the section opened; value: the open titles' },
    { name: 'close', data: 'title: the section closed; value: the open titles' },
  ],
  collapsible: [
    { name: 'open', data: 'value: true' },
    { name: 'close', data: 'value: false' },
  ],
  diagram: [{ name: 'click', data: 'element: the element clicked, as a record' }],
};

export interface Raised {
  cell: string;
  name: string;
  data: Record<string, unknown>;
}
