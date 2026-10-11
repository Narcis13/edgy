---
title: Picture
---

A picture cell shows an image: one you upload, or one you link to by its web address.

::ref kind image

## When to use it

Use a picture for a logo, a photo, a diagram drawn elsewhere, a scan. Its address can carry a [template](term:text-template), so the picture can change with the document. For a small symbol that takes the colour of the text, use an [icon](kind:icon). For shapes and arrows you draw in edgy, use a [diagram](kind:diagram).

## Try it

The picture's address is `data:image/svg+xml,…` with `{{colour}}` in it, and `colour` is the choice beside it. Pick another and the picture follows:

```live id=banner title="A picture that follows a choice" height=140
["row", {"style": {"gap": 12}},
  ["image", {"size": "200px", "fit": "cover", "alt": "A {{colour}} banner with a white circle"},
    "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20160%2090%27%3E%3Crect%20width=%27160%27%20height=%2790%27%20fill=%27{{colour}}%27/%3E%3Ccircle%20cx=%2780%27%20cy=%2745%27%20r=%2724%27%20fill=%27white%27/%3E%3C/svg%3E"],
  ["input", {"name": "colour", "type": "select", "label": "Colour", "value": "teal", "options": ["list", "teal", "tomato", "goldenrod", "slateblue"]}]]
```

A picture you upload has an address on the server that holds the document, such as `/assets/3f9c0a1b2d4e5f607182.png`. A picture from elsewhere has its web address.

## Adding and designing one

- **From the menu.** Select a cell in **Edit**, press `/` and choose **Picture** ([the key](key:kind-menu)). The cell shows a dashed box: *Choose a picture, drop one here, or paste a link in the bar above*.
- **Drop or paste.** Drop an image file onto an empty cell or a picture cell, or paste an image from the clipboard while one is selected. An empty cell becomes a picture.
- **From a link.** Paste the address in the formula bar, which holds the address of a picture cell, or in **Picture link** in **Cell details**.

::shot designer-image "The picture's designer: where it comes from, how it fits the cell, and its description."

**Cell details** has three settings:

- **Picture**: **Choose a file** uploads one, and **Picture link** takes an address, with `{{templates}}` in it if you like.
- **Fit**: **Cover** fills the cell and may crop the picture; **Contain** shows all of it.
- **Description**: what the picture shows. It is read aloud to people who can't see it, and it can carry a template too.

A picture can be a PNG, JPEG, GIF, WebP, AVIF or SVG file of up to 8 MB. Uploads are named by their content, so uploading the same file twice stores it once.

A picture is as wide as its cell. To make it smaller, give its cell a fixed width in a row, as the example does: select the cell, open **Spacing and size** and choose **Fixed** under **Width**.

## In notation

The body is the address:

```notation id=logo
["row", {"size": "hug", "style": {"gap": 12}},
  ["image", {"size": "120px", "fit": "contain", "alt": "Northwind Studio logo"}, "https://example.test/logo.png"],
  ["text", {"style": {"size": 22, "weight": 700, "valign": "center"}}, "Northwind Studio"]]
```

| Prop | What it is |
| --- | --- |
| `src` | The address, when not given as the body. A text, with `{{templates}}` if you like. |
| `fit` | `"cover"` (the default) or `"contain"`. |
| `alt` | The description for people who can't see the picture. A text, with `{{templates}}` if you like. |
| `name` | Lets other cells read the picture's address. |
| `size` | Its room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the cell is out of sight while it holds. |
| `style` | Its look: `radius` for rounded corners, `shadow`, `border`. See [Style keys](/styling/style-keys/). |
| `on` | Handlers, such as `click`. |

## Its value

The picture's address, as text, with its templates worked out; nothing (`nil`) when it has none. Other cells rarely need it.

## Events

::ref events-of image

In **Live**, a picture with a `click` handler can be pressed: it takes a place in the tab order and answers Enter and Space like a button. See [Events and actions](/events/).

## Actions that change it

None. To change the picture a document shows, put a template in its address, as the example does, and change the cell the template reads. [show!](fn:show!) and [hide!](fn:hide!) hide the cell and bring it back.

## On a phone and on paper

On a phone the picture is as wide as the cell, and in a row that wraps it follows the rules in [row](kind:row). On paper it prints as shown. The exported file of a document carries its pictures with it. See [Export](/library/export/).

## Usual mistakes

- **Nothing shows in Live.** The cell has no picture. In **Edit** it shows the dashed box; in **Live** and on paper it shows nothing. Choose a file or paste a link.
- **The picture is cut off.** **Fit** is **Cover**, which fills the cell and crops what doesn't fit. Choose **Contain**.
- **"pictures can be PNG, JPEG, GIF, WebP, AVIF or SVG".** The file is of another type. A toast says *Only pictures can be dropped onto a cell.* when you drop something that isn't an image at all.
- **"that picture is larger than 8 MB".** Make the picture smaller before you upload it.
- **I can't drop onto a table or a text.** Only an empty cell or a picture cell takes a dropped file. Make the cell a picture first.
- **A broken-picture mark shows.** The address doesn't lead to an image, or the site that holds it doesn't allow it to be shown elsewhere. Upload the picture instead.
