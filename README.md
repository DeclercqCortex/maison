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
- **Downloaded models** (619) come from Kenney's Furniture Kit and Nature Kit
  (344, simple low-poly), from [Poly Haven](https://polyhaven.com) (271,
  realistic and textured) and from Khronos (4, below). The Kenney and Poly
  Haven models are public domain (CC0, see `public/models/*/License.txt`).
  The model files live in `public/models`.

Four highly detailed pieces (two velvet accent chairs and two sofas, with
velvet "sheen" and leather materials) come from the
[Khronos glTF sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets),
made by Wayfair (Eric Chadwick), in `public/models/khronos` (19 MB). The
Velvet accent chair is CC0; the Damask accent chair, Glam velvet sofa and Wood
and leather sofa are CC-BY 4.0: © 2021 Wayfair, LLC, and (Wood and leather
sofa) © 2024 Darmstadt Graphics Group GmbH, after a CC0 original by Fran
Calvente. Full credits are in `public/models/khronos/License.txt`;
`npm run models:khronos` downloads them again.

The Poly Haven files (about 630 MB) are in the repository, in
`public/models/polyhaven`: every model Poly Haven files under furniture,
seating, tables, shelves, lighting, decorative, appliances, electronics or
dishes, plus a hand-picked list in `scripts/polyhaven-extra.json`
(houseplants, garden plants, small trees and boulders, food, barrels, crates
and street lamps, and old swords, axes, a mace and a shield; never guns).
Each of those is under 15 MB: Poly Haven's largest scanned trees run to
hundreds of megabytes, too heavy to draw. A few files are left out of the
catalog because they hold several variants side by side or have broken sizes.
`npm run models:download` fetches any that Poly Haven has added since, then
`npm run models` adds them to the catalog. Any other Poly Haven model can be
added from the catalog's search.

`npm run models` measures every model file and rewrites
`src/catalog/models.json`, which gives each one its name, category, real-world
size and where it may be placed. The rules are in
`scripts/build-model-catalog.mjs`. Run it again after adding or removing model
files.

### Simple and Realistic furniture

The switch at the top of the catalog (also in the walk-through toolbar) shows
a project's furniture either as **Simple** low-poly pieces (the built-in pieces
and Kenney's) or as **Realistic** textured ones (Poly Haven's, the Khronos
pieces, museum scans and your own imported models). It is saved with the
project.

The two styles never mix (`display` in `src/catalog/style.ts`):

- The catalog, and its search, list only the current style's pieces.
  Imported and online models are realistic, so importing and the online
  results are offered only in the Realistic style.
- A placed piece is drawn as itself only in its own style. In the other style
  it is drawn as the closest-sized piece of the same kind (sofa, bed, tree,
  rock...; kinds come from names in `src/catalog/kinds.ts`), fitted to the
  same footprint: tables, rugs and plants may be turned a quarter; beds,
  tables and cabinets may be stretched a little; a flower bed or hedge is
  filled with copies of one plant; everything else is scaled evenly. So the
  room's layout is the same in both styles. Garden pieces only stand in for
  garden pieces.
- A placed piece with nothing of its kind in the current style (there is no
  realistic toilet, fridge or kitchen cabinet yet) is drawn as a plain grey
  outline of the space it takes, never in the other style. The catalog lists
  these under "Shown as outlines"; in the Realistic style, clicking one
  searches online for a realistic version.
- The only pieces in both styles are flat ground surfaces (patio, paths,
  driveway, pond), which are the ground's finish rather than furniture.

The landscape itself (the grass, the hills and the trees in the distance, and
the city around an apartment) is the same in both styles.

### Searching

The catalog's search finds pieces by what they are, not just their exact
names (`src/catalog/search.ts`). Plurals count ("chairs"); synonyms count
("couch" finds sofas, "sculpture" finds statues); broad words reach down
("kitchenware" finds pots, pans, kettles, jugs, bowls and the tea set;
"decor" finds statues, vases and frames; "chinese" finds the Chinese and
oriental pieces). Each model's own tags from its library are searched too.
Every word typed must match, and the best matches (by name, then by what the
piece is, then by its tags) come first. Only the current furniture style is
searched. Common searches (Chairs, Sofas, Beds, Statues, Chinese,
Kitchenware...) are one click away under the search box.

In the Realistic style, below the catalog's matches, **Free models online** lists matching
public-domain (CC0) models that are not in the catalog yet, from
[Poly Haven](https://polyhaven.com) (all its models, listed live) and the
[Smithsonian's open-access 3D scans](https://3d.si.edu) (listed in
`src/catalog/smithsonian.json` by `npm run models:smithsonian`). Clicking one
downloads it and opens it in the import dialog below, credited to its source.
Smithsonian scans are Draco-compressed; the decoder is in `public/draco`.

`npm run models:smithsonian` needs a free api.data.gov key
(https://api.data.gov/signup) passed as `SI_API_KEY`; without one it uses the
shared demo key, which allows only a few requests an hour.

### Importing your own models and CAD files

"Import a model or CAD file…" in the catalog adds your own piece. It reads:

- 3D models: glTF (.glb, .gltf), OBJ (with its .mtl and textures), FBX, STL,
  PLY, Collada (.dae), 3DS and 3MF;
- CAD files: STEP (.step, .stp), IGES (.iges, .igs) and BREP, turned into a
  mesh in the browser by OpenCascade
  ([occt-import-js](https://github.com/kovacsv/occt-import-js), LGPL-2.1,
  loaded only when a CAD file is imported).

The dialog shows the model beside a 1.75 m figure. You set what it is (so it
can stand in for simple pieces of that kind), where it goes, the file's units
(guessed from its size: CAD files often measure in millimetres), which way is
up (CAD programs usually use Z), which way it faces, and its width. It is saved
as binary glTF in this browser's IndexedDB, under "Your models". Imported
models are not inside saved `.maison` files, so another browser opening the
project will not have them.
