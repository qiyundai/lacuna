import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AddressDetail, Detail } from './journal-details.js';
import type { Workshop } from './harbor-workshop.js';

type Piece = 'chair' | 'bench' | 'books' | 'sideTable' | 'tableCloth' | 'tableCross' | 'plantSmall1' |
  'pottedPlant' | 'radio' | 'coatRackStanding' | 'bookcaseOpenLow' | 'cardboardBoxOpen' | 'towel' | 'cup' | 'tools';
type Placement = readonly [Piece, number, number?, number?, number?];
type Arrangement = {base?: Placement; pieces: readonly Placement[]};
const furnishings: Record<Detail, Arrangement> = {
  towel: {pieces: [['towel', .78]]},
  foldedLinen: {pieces: [['towel', .39, -.14], ['towel', .34, .16]]},
  travelBooks: {pieces: [['books', .43, -.15], ['cup', .21, .21]]},
  herbPot: {pieces: [['plantSmall1', .64]]},
  breakfastTray: {pieces: [['cup', .22, -.2], ['cup', .18, .1], ['books', .25, .26]]},
  workTray: {pieces: [['tools', .72]]},
  repairBox: {pieces: [['cardboardBoxOpen', .52, -.12], ['tools', .32, .22]]},
  seedTray: {pieces: [['plantSmall1', .35, -.22], ['plantSmall1', .43, .2]]},
  flowerPot: {pieces: [['pottedPlant', .66]]},
  openBooks: {pieces: [['books', .59]]},
  radio: {pieces: [['radio', .62]]},
  dryingStand: {base: ['coatRackStanding', 1.12], pieces: []},
  restingChair: {pieces: [['chair', .91, 0, 0, -.23]]},
  foldedSeat: {base: ['bench', .90], pieces: [['towel', .42, -.16]]},
  packedCrate: {pieces: [['cardboardBoxOpen', .68], ['books', .32, .34, .16]]},
  travelShelf: {base: ['sideTable', .73], pieces: [['books', .39]]},
  breakfastTable: {base: ['tableCloth', .95], pieces: [['cup', .18], ['cup', .15, .27]]},
  herbStand: {base: ['sideTable', .72], pieces: [['plantSmall1', .48]]},
  tableForTwo: {pieces: [['tableCloth', .66], ['chair', .60, -.44, .03, -1.4], ['chair', .60, .44, .03, 1.4]]},
  workTable: {base: ['tableCross', .96], pieces: [['tools', .64]]},
  repairStool: {base: ['sideTable', .59], pieces: [['cardboardBoxOpen', .40]]},
  pottingTable: {base: ['tableCross', .94], pieces: [['plantSmall1', .43, -.23], ['tools', .40, .20]]},
  terracottaPot: {pieces: [['pottedPlant', .88]]},
  pairedChairs: {pieces: [['chair', .77, -.32, 0, -.38], ['chair', .77, .32, 0, .38]]},
  readingChair: {pieces: [['chair', .91, -.17, 0, -.28], ['books', .34, .32]]},
  bookstand: {pieces: [['bookcaseOpenLow', .87]]},
  radioTable: {base: ['sideTable', .76], pieces: [['radio', .51]]},
  changingBench: {pieces: [['bench', 1.45, -.18], ['coatRackStanding', 1.30, .83]]},
  waitingSeats: {pieces: [['bench', 1.28, -.65, 0, -.16], ['bench', 1.28, .65, 0, .16]]},
  longTable: {base: ['tableCloth', 1.78], pieces: [['cup', .2, -.48], ['cup', .2, .48], ['plantSmall1', .32]]},
  workTrestle: {base: ['tableCross', 1.73], pieces: [['tools', .8, -.2], ['cardboardBoxOpen', .45, .48]]},
  plantExchange: {pieces: [['pottedPlant', 1.15, -.45], ['plantSmall1', .88, .25], ['plantSmall1', .58, .68]]},
  meetingCircle: {pieces: [['chair', .94, -.66, -.18, -1], ['chair', .94, .66, -.18, 1], ['chair', .94, 0, .54, 3.14]]},
  bookExchange: {pieces: [['bookcaseOpenLow', 1.38, -.27], ['chair', .87, .59, .22, .52]]}
};

export async function loadJournalFurniture() {
  const kit = await new GLTFLoader().loadAsync('/town/journal-furnishings.glb').catch(() => undefined);
  const models = new Map<string, T.Mesh>();
  const materials = new Set<T.Material>();
  kit?.scene.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    models.set(node.name, node);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    node.geometry.computeBoundingBox();
  });
  function build(shop: Workshop, detail: Detail) {
    if (!models.size) return;
    const group = new T.Group();
    function place([piece, size, x = 0, z = 0, angle = 0]: Placement, y: number) {
      const item = new T.Group();
      item.position.set(x, y, z); item.rotation.y = angle; item.scale.setScalar(size);
      group.add(item);
      if (piece === 'towel') {
        shop.box(item, 'copper', 0,.47,0, 1,.06,.12);
        for(let fold=0;fold<3;fold++){
          const x=-.30+fold*.24, y=.24+Math.sin(fold*2)*.022;
          const pleat=shop.box(item,'cream',x,y,.068,.26,.46,.055);
          pleat.rotation.y=fold===1?-.23:.22;
          shop.box(item,'copper',x,y-.16,.098,.26,.036,.018).rotation.y=pleat.rotation.y;
        }
      } else if (piece === 'tools') {
        shop.box(item, 'bark', -.10,.055,0, .78,.11,.11).rotation.y=-.25;
        shop.box(item, 'iron', .21,.07,.07, .13,.14,.38).rotation.y=-.25;
        shop.box(item, 'copper', -.08,.04,.23, .78,.065,.08).rotation.y=.18;
      } else if (piece === 'cup') {
        shop.piece(item,shop.geometries.plinth,'cream',0,.30,0,.78,.62,.78);
        shop.piece(item,shop.geometries.round,'bark',0,.616,0,.60,.015,.60);
        shop.box(item,'cream',.4,.31,0,.23,.21,.12);
      } else {
        const model = models.get(piece)!;
        item.add(model.clone());
        return size * model.geometry.boundingBox!.max.y;
      }
      return 0;
    }
    const recipe = furnishings[detail];
    const top = recipe.base ? place(recipe.base, 0) : 0;
    for (const part of recipe.pieces) place(part, detail === 'foldedSeat' ? top*.44 : top);
    if (detail === 'dryingStand') place(['towel', .73, .09, .08], .48);
    if (detail === 'changingBench') place(['towel', .73, .78, .10], .65);
    if (detail === 'bookstand' || detail === 'bookExchange')
      place(['books', detail==='bookstand'?.42:.62, detail==='bookstand'?0:-.27,.06], detail==='bookstand'?.17:.27);
    return group;
  }
  return {build, dispose() {
    for (const mesh of models.values()) mesh.geometry.dispose();
    for (const material of materials) material.dispose();
  }};
}

export type JournalFurniture = Awaited<ReturnType<typeof loadJournalFurniture>>;

export function furnishAddress(model: T.Group, residents: AddressDetail[], furniture: JournalFurniture, shop: Workshop,
  remember: (page: string, anchor: T.Group) => void) {
  const windows: T.Object3D[] = [], doors: T.Object3D[] = [];
  model.traverse(node => {
    if (node.name === 'Window ledge') windows.push(node);
    if (node.name === 'Door threshold') doors.push(node);
  });
  for (const {page, socket, index, detail} of residents) {
    const window = socket === 'window';
    const anchor = window ? windows[index] : doors[Math.floor(index / 2)];
    if (!anchor) continue;
    const group = furniture.build(shop, detail);
    if (!group) continue;
    if (window) {
      group.position.z = .07;
      shop.box(group, 'bark', 0,-.055,0,.88,.10,.46);
    } else {
      group.position.set(index % 2 ? .91 : -.91, .035, .36);
      shop.box(group, 'ashlar', 0,-.19,0,1.14,.37,.96);
    }
    anchor.add(group);
    remember(page, group);
  }
}
