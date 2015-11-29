import {visit, visitArray, compile} from '../../utils/compiler';
import { objectToSortedKVArray } from '../../utils/array-utils';
import {
  POST_TYPE,
  MARKUP_SECTION_TYPE,
  LIST_SECTION_TYPE,
  LIST_ITEM_TYPE,
  MARKER_TYPE,
  MARKUP_TYPE,
  IMAGE_SECTION_TYPE,
  CARD_TYPE,
  ATOM_TYPE
} from '../../models/types';

export const MOBILEDOC_VERSION = '0.2.0';
export const MOBILEDOC_MARKUP_SECTION_TYPE = 1;
export const MOBILEDOC_IMAGE_SECTION_TYPE = 2;
export const MOBILEDOC_LIST_SECTION_TYPE = 3;
export const MOBILEDOC_CARD_SECTION_TYPE = 10;

export const MOBILEDOC_MARKUP_CONTENT_TYPE = 0;
export const MOBILEDOC_ATOM_CONTENT_TYPE = 1;

const visitor = {
  [POST_TYPE](node, opcodes) {
    opcodes.push(['openPost']);
    visitArray(visitor, node.sections, opcodes);
  },
  [MARKUP_SECTION_TYPE](node, opcodes) {
    opcodes.push(['openMarkupSection', node.tagName]);
    visitArray(visitor, node.markers, opcodes);
  },
  [LIST_SECTION_TYPE](node, opcodes) {
    opcodes.push(['openListSection', node.tagName]);
    visitArray(visitor, node.items, opcodes);
  },
  [LIST_ITEM_TYPE](node, opcodes) {
    opcodes.push(['openListItem']);
    visitArray(visitor, node.markers, opcodes);
  },
  [IMAGE_SECTION_TYPE](node, opcodes) {
    opcodes.push(['openImageSection', node.src]);
  },
  [CARD_TYPE](node, opcodes) {
    opcodes.push(['openCardSection', node.name, node.payload]);
  },
  [MARKER_TYPE](node, opcodes) {
    opcodes.push(['openMarker', node.closedMarkups.length, node.value]);
    visitArray(visitor, node.openedMarkups, opcodes);
  },
  [MARKUP_TYPE](node, opcodes) {
    opcodes.push(['openMarkup', node.tagName, objectToSortedKVArray(node.attributes)]);
  },
  [ATOM_TYPE](node, opcodes) {
    opcodes.push(['openAtom', node.closedMarkups.length, node.name, node.value, node.payload]);
  }
};

// NOTE - naive implementation just for discussion
function objectToCacheKey(obj) {
  if (!obj) {
    return 'none';
  }

  let attributesArray = objectToSortedKVArray(obj);
  return attributesArray.join('-');
}

const postOpcodeCompiler = {
  openMarker(closeCount, value) {
    this.markupMarkerIds = [];
    this.markers.push([
      MOBILEDOC_MARKUP_CONTENT_TYPE,
      this.markupMarkerIds,
      closeCount,
      value || ''
    ]);
  },
  openMarkupSection(tagName) {
    this.markers = [];
    this.sections.push([MOBILEDOC_MARKUP_SECTION_TYPE, tagName, this.markers]);
  },
  openListSection(tagName) {
    this.items = [];
    this.sections.push([MOBILEDOC_LIST_SECTION_TYPE, tagName, this.items]);
  },
  openListItem() {
    this.markers = [];
    this.items.push(this.markers);
  },
  openImageSection(url) {
    this.sections.push([MOBILEDOC_IMAGE_SECTION_TYPE, url]);
  },
  openCardSection(name, payload) {
    const index = this._findOrAddCardTypeIndex(name, payload);
    this.sections.push([MOBILEDOC_CARD_SECTION_TYPE, index]);
  },
  openAtom(closeCount, name, value, payload) {
    const index = this._findOrAddAtomTypeIndex(name, value, payload);
    this.markupMarkerIds = [];
    this.markers.push([
      MOBILEDOC_ATOM_CONTENT_TYPE,
      this.markupMarkerIds,
      closeCount,
      index
    ]);
  },
  openPost() {
    this.atomTypes = [];
    this.cardTypes = [];
    this.markerTypes = [];
    this.sections = [];
    this.result = {
      version: MOBILEDOC_VERSION,
      atoms: this.atomTypes,
      cards: this.cardTypes,
      markups: this.markerTypes,
      sections: this.sections
    };
  },
  openMarkup(tagName, attributes) {
    const index = this._findOrAddMarkerTypeIndex(tagName, attributes);
    this.markupMarkerIds.push(index);
  },
  _findOrAddCardTypeIndex(cardName, payload) {
    if (!this._cardTypeCache) { this._cardTypeCache = {}; }
    const key = `${cardName}-${objectToCacheKey(payload)}`;

    let index = this._cardTypeCache[key];
    if (index === undefined) {
      let cardType = [cardName, payload];
      this.cardTypes.push(cardType);

      index =  this.cardTypes.length - 1;
      this._cardTypeCache[key] = index;
    }
    return index;
  },
  _findOrAddAtomTypeIndex(atomName, atomValue, payload) {
    if (!this._atomTypeCache) { this._atomTypeCache = {}; }
    const key = `${atomName}-${atomValue}-${objectToCacheKey(payload)}`;

    let index = this._atomTypeCache[key];
    if (index === undefined) {
      let atomType = [atomName, atomValue, payload];
      this.atomTypes.push(atomType);

      index =  this.atomTypes.length - 1;
      this._atomTypeCache[key] = index;
    }
    return index;
  },
  _findOrAddMarkerTypeIndex(tagName, attributesArray) {
    if (!this._markerTypeCache) { this._markerTypeCache = {}; }
    const key = `${tagName}-${attributesArray.join('-')}`;

    let index = this._markerTypeCache[key];
    if (index === undefined) {
      let markerType = [tagName];
      if (attributesArray.length) { markerType.push(attributesArray); }
      this.markerTypes.push(markerType);

      index =  this.markerTypes.length - 1;
      this._markerTypeCache[key] = index;
    }

    return index;
  }
};

/**
 * Render from post -> mobiledoc
 */
export default {
  /**
   * @method render
   * @param {Post}
   * @return {Mobiledoc}
   */
  render(post) {
    let opcodes = [];
    visit(visitor, post, opcodes);
    let compiler = Object.create(postOpcodeCompiler);
    compile(compiler, opcodes);
    return compiler.result;
  }
};
