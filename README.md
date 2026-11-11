# Maison

An interactive home builder that runs in the browser. Draw a floor plan on
paper-style drafting sheets, furnish each floor in 3D, and see the finished
house standing on its own lot in rural grassland.

## Running it

On Windows, double-click **Launch Maison.bat**. It sets Maison up the first
time (this needs [Node.js](https://nodejs.org)), starts it and opens it in your
browser. Keep its window open while you use Maison; close it to stop Maison.
If Maison is already running, the launcher just opens it again.

From a terminal, on any system:

```bash
npm install
npm start
```

`npm start` opens http://localhost:5173 in your browser. Other commands:

- `npm run dev` starts Maison without opening the browser.
- `npm test` runs the unit tests.
- `npm run build` type-checks and builds the production version into `dist/`.

## The three views

- **Plan**: a top-down drafting sheet. Draw walls and rooms, add doors,
  windows, archways, stairs, fireplaces and columns, and stack floors.
- **Interior**: the floor being edited, in 3D. Place furniture from the
  catalog, choose flooring and wall paint, light it, and walk through.
- **Exterior**: the whole house with its roof on a lot sized in acres, with
  grass, trees, a fence and a garden catalog.

All three views draw the same house model, so a change in one shows up in the
others straight away. Work is saved in the browser as you go; "Save file"
writes a `.maison` file you can reopen anywhere.

## How the code is laid out

| Folder | What is in it |
| --- | --- |
| `src/model` | The house data and the geometry behind it: rooms, floors, stairs, placement rules, the lot. No drawing code. |
| `src/store` | The single shared state (with undo and redo) and saving. |
| `src/plan` | The 2D plan editor: tools, snapping, symbols, the side panel. |
| `src/catalog` | Furniture and garden pieces, their 3D models and thumbnails, and floor finishes. |
| `src/three` | The 3D views: walls, floors, roof, landscape, placing furniture, walking. |
| `src/interior`, `src/exterior` | The side panels of the Interior and Exterior views. |

## The catalog

The catalog has two kinds of piece:

- **Built-in pieces** (69) are made from simple shapes in
  `src/catalog/catalog.ts` and can be recoloured.
- **Downloaded models** (344) come from Kenney's Furniture Kit and Nature Kit,
  which are public domain (CC0, see `public/models/*/License.txt`). The model
  files live in `public/models`.

`npm run models` measures every model file and rewrites
`src/catalog/models.json`, which gives each one its name, category, real-world
size and where it may be placed. The rules are in
`scripts/build-model-catalog.mjs`. Run it again after adding or removing model
files.
