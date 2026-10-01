// One plain sentence per kind: what the cell is for.

export const KIND_ABOUT: Record<string, string> = {
  empty: 'Nothing yet. Pick what this cell should hold.',
  text: 'Words, headings and lists, with live values from other cells.',
  formula: 'A value worked out from other cells.',
  input: 'A field people fill in; other cells read what they enter.',
  button: 'Runs an action when clicked, like saving a record or changing a value.',
  image: 'A picture, uploaded or linked.',
  icon: 'A small symbol.',
  chart: 'Draws numbers as bars, lines or parts of a whole.',
  table: 'Rows of records people can search, sort and pick.',
  list: 'Items people add, edit and tick off.',
  calendar: 'A month of events; the day people pick is its value.',
  canvas: 'A surface to draw or sign on.',
  stat: 'A headline number and how it moved.',
  break: 'Starts a new page when the document is printed.',
  row: 'Holds cells side by side.',
  col: 'Holds cells one under another.',
};
