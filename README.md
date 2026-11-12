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

## Projects

Maison opens on a start screen listing every project saved in this browser,
with a sketch of its plan. From there you can carry on with one, copy or
delete it, or start something new:

- **New house**: a house of your own on a plot of rural grassland.
- **New apartment**: one flat in an apartment building of 1 to 50 floors, on
  the floor you choose. It starts with a ready-drawn flat and a balcony edged
  by a glass railing; outside, the whole block is shown, every other flat
  copying the outside of yours. The block stands in a city modelled loosely on
  New York: a grid of streets and avenues with yellow taxis, hundreds of brick,
  stone and glass buildings (with water tanks on the older roofs) whose windows
  light up at night, a large park with a lake, the Empire State Building, and
  the Statue of Liberty on her island across the river. "Look at" buttons in
  the Exterior view glide the camera to the block, the Empire State Building
  or the statue. The city is seen from the flat's windows and balcony too. It is generated from fixed rules in
  `src/model/city.ts`, so it is the same every time.

"Projects" (or the Maison name) in the top bar goes back to the start screen.
Any wall can be made a glass railing in the Plan tab's wall panel, which turns
the space it closes off into an outdoor balcony or deck.

## The three views

- **Plan**: a top-down drafting sheet. Draw walls and rooms, add doors,
  windows, archways, stairs, fireplaces and columns, and stack floors.
- **Interior**: the floor being edited, in 3D. Place furniture from the
  catalog, choose flooring and wall paint, light it, and walk through.
- **Exterior**: the whole house with its roof on a lot sized in acres, with
  grass, trees, a fence and a garden catalog.

All three views draw the same house model, so a change in one shows up in the
others straight away. Work is saved in the browser as you go; "Save file"
writes a `.maison` file you can reopen anywhere. For an apartment, Exterior
shows the apartment block on its grounds, where you set its number of floors,
which floor the flat is on and how many flats sit side by side.

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
- **Downloaded models** (524) come from Kenney's Furniture Kit and Nature Kit
  (344, simple low-poly) and from [Poly Haven](https://polyhaven.com) (180,
  realistic and textured). All are public domain (CC0, see
  `public/models/*/License.txt`). The model files live in `public/models`.

The Poly Haven files (about 360 MB) are kept out of git. On a fresh copy of
the project, fetch them with `npm run models:download`; until then those
catalog pieces have no picture and do not appear in the 3D view.

`npm run models` measures every model file and rewrites
`src/catalog/models.json`, which gives each one its name, category, real-world
size and where it may be placed. The rules are in
`scripts/build-model-catalog.mjs`. Run it again after adding or removing model
files.
