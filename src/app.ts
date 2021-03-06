/*
 * QuiltDraw - Quarter-Square Triangle Designer
 * Copyright (C) 2020 sapphirecat <devel@sapphirepaw.org>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * https://github.com/sapphirecat/quilt-draw/
 */

import type Pickr from "../node_modules/@simonwep/pickr/src/js/pickr.js";
import type HSVaColor from "../node_modules/@simonwep/pickr/src/js/utils/hsvacolor.js";

type Color = string;

interface SashInfo {
    levels: number;
    colors: [Color, Color];
}

interface RenderData {
    borderUnits: number;
    blockCells: number;
    hasSash: boolean;
    cHoriz: number;
    cVert: number;
    cellSize?: number;
    padSize?: number;
    blockSize?: number;
}

interface _RenderView {
    layout: string;
    editorState?: number;
    quilt?: Quilt;
}

class Point {
    constructor(readonly x: number, readonly y: number) {
    }

    offset(x: number, y: number) {
        return new Point(x + this.x, y + this.y);
    }
}

class Rect {
    constructor(readonly w: number, readonly h: number) {
    }
}

class Border {
    constructor(public cellWidth: number, public color: Color) {
    }

    equals(other: Border | undefined | null) {
        return other && this.cellWidth === other.cellWidth && this.color === other.color;
    }
}

class Palette extends Array<string> {
    equals(other: Palette | undefined | null) {
        if (!(other && this.length === other.length)) {
            return false;
        }

        for (let i = 0; i < this.length; i++) {
            if (this[i] !== other[i]) {
                return false;
            }
        }

        return true;
    }

    copy(): Palette {
        return new Palette(...this);
    }
}

class Cell {
    colors: [number, number, number, number]; // four quarter-squares: top, right, bottom, left.

    constructor(top: number, right: number, bottom: number, left: number) {
        this.colors = [top, right, bottom, left];
    }

    copy(): Cell {
        return new Cell(...this.colors);
    }

    rotateRight(): this {
        const c = this.colors;
        this.colors = [c[3], c[0], c[1], c[2]];
        return this;
    }

    rotateLeft(): this {
        const c = this.colors;
        this.colors = [c[1], c[2], c[3], c[0]];
        return this;
    }
}

class CellList extends Array<Cell> {
    copy(): CellList {
        return new CellList(...this.map(v => v.copy()));
    }

    getSize(): number {
        return Math.floor(Math.sqrt(this.length));
    }
}

class BlockInfo {
    private dirty: boolean = true;
    private readonly canvas: HTMLCanvasElement;
    private lastColors?: Palette;
    private lastPixelSize?: number;
    private savedCells: CellList;

    constructor(private cells: CellList) {
        this.savedCells = cells.copy();
        this.canvas = document.createElement('canvas');
    }

    getSize(): number {
        return this.cells.getSize();
    }

    isDirty(): boolean {
        return this.dirty;
    }

    getSource(pixelSize: number, colors: Palette): CanvasImageSource {
        // check our argument states
        if (!colors.equals(this.lastColors)) {
            this.dirty = true;
            this.lastColors = colors.copy();
        }

        if (this.lastPixelSize !== pixelSize) {
            this.dirty = true;
            this.lastPixelSize = pixelSize;
            this.canvas.width = pixelSize;
            this.canvas.height = pixelSize;
        }

        // if any (arguments or internal) state has updated, redraw
        if (this.dirty) {
            this.draw(colors);
        }

        // return the results
        return this.canvas;
    }

    getScaledSource(scaledSize: number): CanvasImageSource {
        if (this.dirty) {
            this.draw(this.lastColors);
        }

        const target = document.createElement('canvas');
        target.width = scaledSize;
        target.height = scaledSize;

        const ctx = target.getContext('2d', {alpha: false});
        ctx.drawImage(this.canvas, 0, 0, scaledSize, scaledSize);
        return target;
    }

    spinCell(i: number, reverse?: boolean): void {
        if (i >= this.cells.length) {
            return;
        }

        if (reverse) {
            this.cells[i].rotateLeft();
        } else {
            this.cells[i].rotateRight();
        }

        this.dirty = true;
    }

    paintSubCell(i: number, j: number, color: number): void {
        if (i >= this.cells.length || j > 3) {
            return; // out of bounds
        }
        if (this.cells[i].colors[j] === color) {
            return; // painted same color
        }

        this.cells[i].colors[j] = color;
        this.dirty = true;
    }

    resize(toSize: number): void {
        const currentSize = this.cells.getSize();

        if (toSize === currentSize) {
            return;
        }

        // copy updates into the saved cells
        this.saveCurrentCells();

        if (toSize > currentSize) {
            this.resizeUp(currentSize, toSize);
            if (this.savedCells.getSize() < toSize) {
                this.savedCells = this.cells.copy();
            }
        } else {
            this.resizeDown(toSize);
        }

        this.dirty = true;
    }

    private saveCurrentCells(): void {
        const saved = this.savedCells;
        const current = this.cells;
        const currentSize = current.getSize();
        const savedSize = saved.getSize();

        // if we haven't saved the block yet, just copy current over
        if (savedSize <= currentSize) {
            this.savedCells = this.cells.copy();
            return;
        }

        // saved block is larger than current. copy all current cells into the
        // upper-left of the saved cells.
        const skip = savedSize - currentSize;
        for (let row = 0, i = 0, j = 0; row < currentSize; row++) {
            for (let col = 0; col < currentSize; col++) {
                saved[j++] = current[i++];
            }
            j += skip; // move to the next start-of-row in saved
        }
    }

    rollLeft(): void {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row, (col + 1) % sz];
        });
    }

    rollRight(): void {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row, col ? col - 1 : sz - 1];
        });
    }

    rollUp(): void {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [(row + 1) % sz, col];
        });
    }

    rollDown(): void {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row ? row - 1 : sz - 1, col];
        });
    }

    private resizeUp(currentSize: number, toSize: number): void {
        const current = this.cells;
        const saved = this.savedCells;
        const savedSize = saved.getSize();
        const fillSize = Math.min(savedSize, toSize);
        const output = new CellList(toSize * toSize);

        let row, col, siCurrent, siSaved;
        let di = 0;

        // up to 3 sources per row: current, saved, random values
        for (row = 0, siCurrent = 0; row < currentSize; row++) {
            for (col = 0; col < currentSize; col++) {
                output[di++] = current[siCurrent++];
            }
            for (siSaved = row * savedSize + currentSize; col < fillSize; col++) {
                output[di++] = saved[siSaved++];
            }
            for (; col < toSize; col++) {
                output[di++] = randomCell();
            }
        }

        // current rows exhausted
        for (siSaved = row * savedSize; row < fillSize; row++) {
            // instead of current, it all comes from saved
            for (col = 0; col < savedSize; col++) {
                output[di++] = saved[siSaved++];
            }
            for (; col < toSize; col++) {
                output[di++] = randomCell();
            }
        }

        // saved rows exhausted, fill remaining rows with random values
        for (; row < toSize; row++) {
            for (col = 0; col < toSize; col++) {
                output[di++] = randomCell();
            }
        }

        this.cells = output;
    }

    private resizeDown(toSize: number): void {
        const input = this.cells;
        const output = new CellList(toSize * toSize);
        const skip = this.cells.getSize() - toSize;

        // destination and source indices
        let di = 0;
        let si = 0;

        // copy from the upper-left of current cells
        for (let row = 0; row < toSize; row++) {
            for (let col = 0; col < toSize; col++) {
                output[di++] = input[si++];
            }
            si += skip; // skip rightmost columns of the current cell list
        }

        this.cells = output;
    }

    private roll(mappingFn): void {
        const output = new CellList(this.cells.length);
        const size = this.cells.getSize();

        // walk across output in order. ask the mapping function where the data
        // for the row/column of output is located in the source, by row/column.
        let i = 0;
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const [readRow, readCol] = mappingFn(row, col);
                output[i++] = this.cells[readCol + (readRow * size)];
            }
        }

        this.cells = output;
        this.savedCells = new CellList(); // clear resize buffer
        this.dirty = true;
    }

    private draw(colors: Palette) {
        const cells = this.cells;
        const size = cells.getSize();
        const cellPx = this.canvas.width / size;

        // cell origin and current block index
        let oX, oY, iBlock;

        // canvas 2D context
        const ctx = this.canvas.getContext('2d', {alpha: false});

        // process editor cells in unscaled space
        iBlock = 0; // index into block array
        for (let cY = 0; cY < size; ++cY) {
            oY = cY * cellPx; // Y-origin = cell Y-index (row) times cell height
            for (let cX = 0; cX < size; ++cX) {
                oX = cX * cellPx;
                drawCellAt(ctx, oX, oY, cellPx, colors, cells[iBlock++]);
            }
        }

        this.dirty = false;
    }
}

class Quilt {
    constructor(public block: BlockInfo,
                public borders: Array<Border>,
                public colorSet: Palette,
                public sash: SashInfo) {
    }
}


const editor = document.getElementById('editor') as HTMLCanvasElement;
const preview = document.getElementById('preview') as HTMLCanvasElement;

let EDITOR_MAX_WIDTH = editor.width;
// no EDITOR_MAX_HEIGHT: it is square.
let PREVIEW_MAX_WIDTH = preview.width;
let PREVIEW_MAX_HEIGHT = preview.height;
const PREVIEW_MIN_RESIZE = 500;
const PREVIEW_MAX_RESIZE = 1000;
const DOWNLOAD_MIN_HEIGHT = 1400;

const BLOCKS_HORIZ = 4; // number of block copies across the preview
const BLOCKS_VERT = 5; // number of block copies down the preview

const BORDER_LIMIT = 6; // maximum number of borders that may be added
const COLOR_LIMIT = 12; // maximum number of colors in the palette

const SASH_NONE = 0; // sash disabled
const SASH_SINGLE = 1; // all one color
const SASH_DOUBLE = 2; // second color at intersections

const POINTER_EVENTS = 'PointerEvent' in window;
const MOVE_IGNORE = 0; // tool does not allow holding mouse down
const MOVE_ALLOW = 1; // tool supports holding mouse down, but handler is inactive
const MOVE_TRACKING = 2; // mouse is down, and event handler is active

const CLICK_ALLOW = 0; // click event should be reacted to
const CLICK_IGNORE = 1; // click event should be suppressed

const TOOL_PAINT = 'paint'; // set color of tiles
const TOOL_SPIN = 'spin'; // turn tiles

// Lookup table for calculating cell hits. A = top/right side, B = bottom/left;
// X = bottom/right, Y = top/left.  AY = intersect(A, Y) = top.  The value in
// this object is the index into the Cell.colors for the sub-area that was hit.
// That is, we calculate A-or-B, and X-or-Y, then look up the results here to
// determine which triangle gets painted.
const CELL_QUADRANTS = {
    "AY": 0,
    "AX": 1,
    "BX": 2,
    "BY": 3
};

const pickers = {};

const quilt = newQuilt();

const ui = {
    editorState: 0,
    cellPx: 0, // editor cell size in pixels (width & height)
    colorEvents: CLICK_ALLOW,
    colorTemplate: null,
    colorBox: null,
    borderTemplate: null,
    moveStatus: MOVE_ALLOW, // paint (default tool) allows moves
    paintColors: [1, 0], // primary/secondary paint colors
    selectedTool: TOOL_PAINT
};

const view: _RenderView = {
    layout: "NA",
};

function newSash(): SashInfo {
    return {
        levels: SASH_NONE,
        colors: ['#001', '#002'],
    };
}

function newQuilt(): Quilt {
    return new Quilt(new BlockInfo(new CellList()), [], new Palette(), newSash());
}

/**
 * Update the display of currently-selected paint colors.
 */
function showActiveColor(slot: number): void {
    const view = document.getElementById(`colorActive${slot}`);
    if (view) {
        const colorIndex = ui.paintColors[slot];
        view.style.backgroundColor = quilt.colorSet[colorIndex];
    } else {
        console.error('No element for #colorActive%d', slot);
    }
}

function setChecked(id: string, checked = true): void {
    try {
        const el = document.getElementById(id) as HTMLInputElement | null;
        el.checked = checked;
    } catch (e) {
        console.error(e);
    }
}

/**
 * Activate the paint tool with the selected palette entry.
 *
 * @param {number} i Palette index to be set as paint color.
 * @param {number} [slot] A slot number to set, or the primary slot (0) by default.
 */
function setPaintColor(i: number, slot = 0): void {
    if (slot === undefined) {
        slot = 0;
    } else if (slot < 0 || slot > ui.paintColors.length) {
        console.error('invalid slot; paint color %d rejected', slot);
        return;
    }

    const prev = ui.paintColors[slot];

    ui.paintColors[slot] = i;
    showActiveColor(slot);

    // activate the tool
    ui.selectedTool = TOOL_PAINT;
    setChecked('tool-paint');
    if (ui.moveStatus === MOVE_IGNORE) {
        ui.moveStatus = MOVE_ALLOW;
    }

    // move the selection hint for primary color only
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove('selected');
        document.getElementById(`color${i}`).classList.add('selected');
    }
}

function randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 35);
    const lns = 35 + Math.floor(Math.random() * 40);
    return `hsla(${hue}, ${sat}%, ${lns}%, 1.0)`;
}

/**
 * Generate a random cell structure.
 */
function randomCell(): Cell {
    const colorCount = Math.floor(quilt.colorSet.length);

    return new Cell(
        (Math.floor(Math.random() * colorCount)),
        (Math.floor(Math.random() * colorCount)),
        (Math.floor(Math.random() * colorCount)),
        (Math.floor(Math.random() * colorCount))
    );
}

function getPalette(element): Palette {
    // we have some sentinel color values in here, to detect major errors in
    // script initialization.  we should never see these.
    if (!element) {
        return new Palette('#00ccff');
    }

    const colorText = element.getAttribute('data-initial-palette') || '#ff00ff';
    const colors = colorText.split(/,\s*/);
    return new Palette(...colors);
}

/**
 * @param {string} id Element ID
 * @return {boolean} Whether the element is present and checked.
 */
function isChecked(id: string): boolean {
    const node = document.getElementById(id) as HTMLInputElement | null;
    return node && node.checked;
}

function initJs(): void {
    // set up UI
    initColors();
    initBorders();
    initTools();

    // generate a random initial quilt
    initQuiltBlock();

    // un-hide JS content
    document.getElementById('app').className = '';

    // set up semi-fluid UI
    window.addEventListener('resize', onResizeViewport);
    onResizeViewport();
}

function initQuiltBlock(): void {
    // get initial size from the HTML
    const sizeInput = document.getElementById('cell-size');
    const size = sizeInput && sizeInput instanceof HTMLInputElement ?
        parseInt(sizeInput.value, 10) :
        5;
    const cells = new CellList();

    for (let column = 0; column < size; column++) {
        for (let row = 0; row < size; row++) {
            cells.push(randomCell());
        }
    }

    quilt.block = new BlockInfo(cells);
}

function initTools(): void {
    const colorItems = document.getElementById('color-items');

    // Pointer-related events: try Pointer, fall back to Mouse.
    if (POINTER_EVENTS) {
        // set up editor
        editor.addEventListener('pointerdown', onEditorMouse);
        editor.addEventListener('pointerup', onEditorMouseRelease);
        editor.addEventListener('pointercancel', onEditorMouseRelease);

        // set up main controls
        // we still get a click event, so we use ui.colorEvents to ignore one
        // if it follows a mousedown we took responsibility for.
        colorItems.addEventListener('pointerdown', onPaletteDown, {capture: true});
        colorItems.addEventListener('click', onPaletteClick, {capture: true});
    } else {
        editor.addEventListener('mousedown', onEditorMouse);
        editor.addEventListener('mouseup', onEditorMouseRelease);

        colorItems.addEventListener('mousedown', onPaletteDown, {capture: true});
        colorItems.addEventListener('click', onPaletteClick, {capture: true});
    }

    // set up the remaining (non-pointer) editor and color-picker events
    editor.addEventListener('contextmenu', (ev) => ev.preventDefault());
    colorItems.addEventListener('contextmenu', (ev) => ev.preventDefault());

    // pre-select the paint tool to match the script state
    setChecked('tool-paint');

    // wire in the rest of the controls' events
    for (const node of document.querySelectorAll('.controls')) {
        node.addEventListener('click', onControlClick);
    }
    for (const node of document.querySelectorAll('#transforms input[type=range]')) {
        node.addEventListener('input', onControlClick);
    }

    // set up sashing colors
    initSashColors();
    if (isChecked('sash-on')) {
        quilt.sash.levels = isChecked('sash-cross-on') ? SASH_DOUBLE : SASH_SINGLE;
    }
}

function initBorders(): void {
    // create the default border
    ui.borderTemplate = document.getElementById('border-item');
    getPalette(ui.borderTemplate).forEach(addBorder);

    // set up events
    const root = ui.borderTemplate.parentElement;
    root.addEventListener('input', onBorderSize);

    const newBorder = () => {
        addBorder();
        updatePreview(editor, quilt);
        if (quilt.borders.length >= BORDER_LIMIT) {
            document.getElementById('border-new').classList.add('hide');
        }
    };
    document.getElementById('border-new').addEventListener('click', newBorder);
}

function initSashColors(): void {
    const colors = getPalette(document.getElementById('sashing'));
    const targets = ['main-sash-color', 'cross-sash-color'];
    if (colors.length !== targets.length) {
        console.error("Sash palette length %d does not match UI element count %d",
            colors.length, targets.length);
        return;
    }

    for (let i = 0; i < targets.length; i++) {
        const node = document.getElementById(targets[i]);
        if (!node) {
            console.error(`Target element id=${targets[i]} not found`);
            break; // fail somewhat gracefully
        }
        addSashColor(i, node, colors[i]);
    }
}

function initColors(): void {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById('color-item');
    ui.colorBox = document.getElementById('color-items');

    // double-check that our requirements are fulfilled
    if (!(ui.colorTemplate && ui.colorBox)) {
        console.error("Invalid HTML: missing template#color-item or #colors");
        return;
    }


    // parse the initial palette data and create Pickr UI
    // create Pickr UI for each initial palette entry
    getPalette(ui.colorBox).forEach(addColor);

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.paintColors[0], quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).classList.add('selected');
        showActiveColor(0);
    }

    showActiveColor(1);

    // set up "New Color" button
    document.getElementById('color-new').addEventListener('click', createColor);
}

function createColor(): void {
    if (quilt.colorSet.length >= COLOR_LIMIT) {
        alert("That's just too many colors.");
        return;
    }

    const i = addColor(randomColor());
    setPaintColor(i);

    if (i + 1 >= COLOR_LIMIT) {
        document.getElementById('color-new').classList.add('hide');
    }
}

function newColorPicker(button: HTMLElement, value: string) {
    return Pickr.create({
        el: button,
        theme: 'nano',
        lockOpacity: true,
        default: value,
        defaultRepresentation: 'HSLA',
        adjustableNumbers: true,

        components: {
            preview: true,
            hue: true,
            interaction: {
                hex: true,
                hsla: true,
                hsva: false,
                rgba: false,
                cmyk: false,

                input: true,
                cancel: true,
                save: false,
                clear: false
            }
        },

        strings: {
            cancel: "Reset"
        }
    });
}

function addColor(value: string): number | undefined {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true);

    // configure sub-DOM
    const button = item.querySelector('.color-button');
    if (!button) {
        console.error("Cannot find '.color-button' in ui.colorTemplate");
        return;
    }

    const dataNode = button.parentElement; // label.color-item
    dataNode.setAttribute('data-color-id', `${i}`);
    dataNode.id = `color${i}`;

    // define the color
    quilt.colorSet[i] = value;

    // activate the picker
    const picker = newColorPicker(button, value);

    // set up events
    picker.on('change', newValue => onColorChanged(i, newValue));
    picker.on('hide', () => onColorPickerHide(i));
    picker.on('cancel', () => onColorReset(i));

    // insert the whole template into the DOM
    ui.colorBox.appendChild(item);

    // save the picker for future interaction
    pickers[i] = {
        handle: picker,
        saved: value,
    };

    return i;
}

function onColorPickerHide(i: number): void {
    pickers[i].saved = quilt.colorSet[i]; // save color for next cancel button click
    pickers[i].handle.applyColor(true); // save color to button, without firing a save event
    document.getElementById('color-items').focus({preventScroll: true});
    setPaintColor(i);
}

function onColorChanged(i: number, value: HSVaColor): void {
    quilt.colorSet[i] = value.toHSLA().toString();
    updateView();
}

function onColorReset(i: number): void {
    quilt.colorSet[i] = pickers[i].saved;
    updateView();
}

function onSashColorPickerHide(i: number): void {
    pickers[`sash.${i}`].saved = quilt.sash.colors[i]; // save color for next cancel button click
    pickers[`sash.${i}`].handle.applyColor(true); // save color to button, without firing a save event
}

function onSashColorChanged(i: number, value: HSVaColor) {
    quilt.sash.colors[i] = value.toHSLA().toString();
    updatePreview(editor, quilt);
}

function onSashColorReset(i: number): void {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(editor, quilt);
}

function addSashColor(i: number, button: HTMLElement, value: string): void {
    const picker = newColorPicker(button, value);

    picker.on('change', newValue => onSashColorChanged(i, newValue));
    picker.on('hide', () => onSashColorPickerHide(i));
    picker.on('cancel', () => onSashColorReset(i));

    pickers[`sash.${i}`] = {handle: picker, saved: value};
    quilt.sash.colors[i] = value;
}

function onBorderColorPickerHide(i: number): void {
    pickers[`border.${i}`].saved = quilt.borders[i].color; // save color for next cancel button click
    pickers[`border.${i}`].handle.applyColor(true); // save color to button, without firing a save event
}

function onBorderColorChanged(i: number, value: HSVaColor): void {
    quilt.borders[i].color = value.toHSLA().toString();
    updatePreview(editor, quilt);
}

function onBorderColorReset(i: number): void {
    quilt.borders[i].color = pickers[`border.${i}`].saved;
    updatePreview(editor, quilt);
}


/**
 * Add another border layer
 */
function addBorder(color?: string): void {
    if (quilt.borders.length >= BORDER_LIMIT) {
        return;
    }

    const i = quilt.borders.length;
    const item = ui.borderTemplate.content.cloneNode(true);
    const range = item.querySelector("input[type=range]");
    const width = 1 + Math.floor(Math.random() * 3);
    const border = new Border(width, color || randomColor());

    item.querySelector('p').appendChild(document.createTextNode(`${i + 1}`));

    range.id = `borderWidth${i}`;
    range.setAttribute('data-border-index', `${i}`);
    range.value = border.cellWidth;

    const picker = newColorPicker(item.querySelector(".color-button"), border.color);
    // set up events
    picker.on('change', newValue => onBorderColorChanged(i, newValue));
    picker.on('hide', () => onBorderColorPickerHide(i));
    picker.on('cancel', () => onBorderColorReset(i));

    // commit changes
    quilt.borders[i] = border;
    pickers[`border.${i}`] = {handle: picker, saved: border.color};
    ui.borderTemplate.parentElement.appendChild(item);
}


function isButtonRelevant(ev: MouseEvent): boolean {
    return !!(ev.buttons && ev.buttons < 3);
}

function isPrimaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 1;
}

function isSecondaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 2;
}

function editorClearMoveHandler(): void {
    editor.removeEventListener(POINTER_EVENTS ? 'pointermove' : 'mousemove', onEditorMouse);
    ui.moveStatus = MOVE_ALLOW;
}

function editorSetMoveHandler(): void {
    ui.moveStatus = MOVE_TRACKING;
    editor.addEventListener(POINTER_EVENTS ? 'pointermove' : 'mousemove', onEditorMouse);
}

function onEditorMouseRelease(ev: MouseEvent): void {
    ev.preventDefault();
    if (ui.moveStatus !== MOVE_IGNORE) {
        editorClearMoveHandler();
    }
}

function onEditorMouse(ev: MouseEvent): void {
    // if multiple buttons or a higher (aux etc.) button was pressed, ignore
    // everything. don't even prevent default.
    if (ev.buttons && !isButtonRelevant(ev)) {
        return;
    }

    // we are taking responsibility for this event
    ev.preventDefault();

    // if the mouse was released out-of-canvas, cancel ourselves
    if (!ev.buttons) {
        editorClearMoveHandler();
        return;
    }

    // if this is the first mousedown, set us up to be called on move
    if (ui.moveStatus === MOVE_ALLOW) {
        editorSetMoveHandler();
    }

    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.block.getSize();
    const cellPx = editor.width / sz;
    const index = _(x / cellPx) + (sz * _(y / cellPx));

    // act on the hit
    const isSecondaryClick = isSecondaryButton(ev);
    switch (ui.selectedTool) {
        case TOOL_PAINT:
            // translate coordinates to cell-relative
            const top = _(index / sz) * cellPx;
            const left = _(index % sz) * cellPx;
            const hitX = x - left;
            const hitY = y - top;

            // determine which quadrant of the cell was hit
            const quadrantKey = `${hitX > hitY ? "A" : "B"}${hitX > (cellPx - hitY) ? "X" : "Y"}`;
            const colorIndex = CELL_QUADRANTS[quadrantKey];

            // apply color to the index that was hit
            const colorChosen = ui.paintColors[isSecondaryClick ? 1 : 0];
            quilt.block.paintSubCell(index, colorIndex, colorChosen);

            break;
        case TOOL_SPIN:
            quilt.block.spinCell(index, isSecondaryClick);
            break;
        default:
            console.error("Unknown tool selected: %s", ui.selectedTool)
    }

    updateView();
}

function onBorderSize(ev: InputEvent): void {
    if (!(ev.target instanceof HTMLInputElement)) {
        return;
    }

    const i = parseInt(ev.target.getAttribute('data-border-index') || '0', 10) || 0;
    quilt.borders[i].cellWidth = parseInt(ev.target.value, 10);
    updatePreview(editor, quilt);
}

/**
 * Delegating event handler for control input-radio clicks
 */
function onControlClick(ev: MouseEvent): void {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    if (!target.tagName.toLowerCase().match(/^(?:button|input)$/)) {
        return;
    }

    const classes = target.classList;
    if (classes.contains('resize')) {
        onResizeInput(ev);
    } else if (classes.contains('sash-select')) {
        onSashChange(ev);
    } else if (classes.contains('tool-active')) {
        onToolChange(ev);
    } else if (classes.contains('roll')) {
        onRollerClick(ev);
    } else if (classes.contains('download')) {
        onDownload(ev);
    }
}

/**
 * Capturing event handler for palette
 */
function onPaletteDown(ev: MouseEvent): void {
    ui.colorEvents = CLICK_ALLOW; // by default, we do not have full responsibility
    if (!isButtonRelevant(ev)) {
        return; // we don't handle this button/combo
    }

    // walk up the DOM until we find the label.color-item
    let node = ev.target;
    let found = false;
    while (node !== this && !found) {
        if (!(node instanceof HTMLElement)) {
            console.error("DOM walk-up reached non HTML element");
            console.debug(node);
            return;
        }
        if (node.tagName === 'LABEL' && node.classList.contains('color-item')) {
            found = true;
        } else {
            node = node.parentElement;
        }
    }
    if (!(found && node instanceof HTMLElement)) {
        console.error("label element not found in event stack");
        return;
    }

    const colorIndex = parseInt(node.getAttribute('data-color-id'), 10);

    // if this is a PRIMARY click on a SELECTED color, pass the event through
    // to Pickr. we'll update the color when the picker is closed.
    if (isPrimaryButton(ev) && colorIndex === ui.paintColors[0]) {
        return;
    }

    // SECONDARY click or NON-SELECTED color. Take over the event ourselves.
    ev.preventDefault();
    ev.stopPropagation();
    ui.colorEvents = CLICK_IGNORE; // reject a 'click' if it is also generated
    setPaintColor(colorIndex, isSecondaryButton(ev) ? 1 : 0);
}

function onPaletteClick(ev: MouseEvent): void {
    if (ui.colorEvents === CLICK_IGNORE) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    ui.colorEvents = CLICK_ALLOW;
}

function onToolChange(ev: MouseEvent): void {
    const node = ev.target;
    if (!(node instanceof HTMLElement)) {
        return;
    }
    ui.selectedTool = node.id.replace(/^tool-/, '');

    // update movement state
    if (ui.moveStatus === MOVE_TRACKING) {
        editorClearMoveHandler();
    }
    ui.moveStatus = node.getAttribute('data-move-tracking') === '1' ? MOVE_ALLOW : MOVE_IGNORE;
}

function onSashChange(ev: MouseEvent): void {
    // do-nothing op to make the event appear used. maintains a consistent
    // interface across all the `onSomeEvent(ev)` functions.
    if (ev.defaultPrevented) {
        return;
    }

    const main = document.getElementById('sash-on') as HTMLInputElement;
    const cross = document.getElementById('sash-cross-on') as HTMLInputElement;

    quilt.sash.levels = main.checked ? (cross.checked ? SASH_DOUBLE : SASH_SINGLE) : SASH_NONE;
    updatePreview(editor, quilt);
}

function onDownload(ev: MouseEvent): void {
    const node = ev.target;
    ev.preventDefault();

    if (!(node instanceof HTMLButtonElement)) {
        return;
    }

    // figure out what we're downloading
    const isPreview = node.id === 'download-preview';
    const source = isPreview ? renderDownload(editor, quilt) : editor;
    const basename = isPreview ? 'quilt' : 'block';

    // generate download
    const link = document.createElement('a');
    link.href = source.toDataURL('image/png');
    link.download = `${basename}.png`;
    link.click();
}

/**
 * Roll the quilt block in some direction.
 */
function onRollerClick(ev: MouseEvent): void {
    const movers = {
        "roll-up": (b: BlockInfo) => b.rollUp(),
        "roll-down": (b: BlockInfo) => b.rollDown(),
        "roll-left": (b: BlockInfo) => b.rollLeft(),
        "roll-right": (b: BlockInfo) => b.rollRight()
    };

    if (!(ev.target instanceof Element)) {
        return;
    }

    const callback = movers[ev.target.id];
    if (callback) {
        callback(quilt.block);
        updateView();
    }
}

/**
 * Resize the quilt's cells-per-block.
 */
function onResizeInput(ev: MouseEvent): void {
    const node = ev.target;
    if (!(node instanceof HTMLInputElement)) {
        return;
    }

    // perform the resizing operation
    const newSize = parseInt(node.value, 10);
    quilt.block.resize(newSize);

    // update the view
    updateView();
}

function onResizeViewport(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // determine the preview's natural width
    let gridWidth = (width - 20) * 0.4; // 2fr of a total of 5fr
    gridWidth -= gridWidth % 30;

    // determine the width of the preview if it's height-limited
    let gridHeight = height - 24;
    gridHeight -= gridHeight % 24;
    const heightWidth = Math.floor(gridHeight * (BLOCKS_HORIZ / BLOCKS_VERT));

    // now decide which of those gets used, then clamp it to our limits
    const previewHeight = Math.ceil(Math.min(gridWidth, heightWidth) * (BLOCKS_VERT / BLOCKS_HORIZ));
    PREVIEW_MAX_HEIGHT = Math.min(Math.max(previewHeight, PREVIEW_MIN_RESIZE), PREVIEW_MAX_RESIZE);
    // calculate the width based on the final height
    PREVIEW_MAX_WIDTH = Math.floor(PREVIEW_MAX_HEIGHT * (BLOCKS_HORIZ / BLOCKS_VERT));

    // limit the editor width to the preview width, to the next lower 60; this
    // maximizes usable space for 2-6 cell blocks, expected to be common.
    EDITOR_MAX_WIDTH = Math.max(360, PREVIEW_MAX_WIDTH - 24);
    EDITOR_MAX_WIDTH -= EDITOR_MAX_WIDTH % 60;

    updateView();
}

function sizeCanvasTo(canvas: HTMLCanvasElement, width: number, height: number) {
    const DPR = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = "${width}px";
    canvas.style.height = "${height}px";
}

/**
 * Draw a triangle at coordinates on the canvas.
 */
function drawTriangle(ctx: CanvasRenderingContext2D, points: Array<Point>, fillStyle: string): void {
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);

    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

/**
 * Draw a polygon at coordinates on the canvas.
 */
function drawPoly(ctx: CanvasRenderingContext2D, points: Array<Point>, fillStyle: string): void {
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

/**
 * Draw a cell into a coordinate on the canvas.
 */
function drawCellAt(ctx: CanvasRenderingContext2D, oX: number, oY: number, cellPx: number, palette: Palette, cell: Cell): void {
    // Determine all coordinates we can draw from: top/left/bottom/right pairs, and center
    const tl = new Point(oX, oY);
    const tr = new Point(oX + cellPx, oY);
    const bl = new Point(oX, oY + cellPx);
    const br = new Point(oX + cellPx, oY + cellPx);
    const c = new Point(oX + cellPx / 2, oY + cellPx / 2);
    const lc = c.offset(-1, 0); // left of center
    const rc = c.offset(1, 0);

    // Draw all four triangles into place, but eliminate seams by drawing the
    // top and bottom first, but bigger.
    // top-left, top-right, 1px down, 1px right-of-center, 1px left-of-center, 1px below top-left
    drawPoly(ctx, [tl, tr, tr.offset(0, 1), rc, lc, tl.offset(0, 1)], palette[cell.colors[0]]);
    // bot-left, bot-right, 1px up, 1px right-of-center, 1px left-of-center, 1px above bot-left
    drawPoly(ctx, [bl, br, br.offset(0, -1), rc, lc, bl.offset(0, -1)], palette[cell.colors[2]]);
    // draw left/right triangles over the edges of the polygons
    drawTriangle(ctx, [c, tr, br], palette[cell.colors[1]]);
    drawTriangle(ctx, [c, bl, tl], palette[cell.colors[3]]);
}

/**
 * Draw a block into the editor area of the canvas.
 */
function updateEditor(colors: Palette, block: BlockInfo): void {
    // render the blockInfo into the editor canvas
    const cellCount = block.getSize();
    let dirty = block.isDirty();

    // Resize editor if needed, assuming square
    const cW = 2 * Math.floor(EDITOR_MAX_WIDTH / cellCount / 2);
    const pixelSize = cW * cellCount;
    if (cW !== ui.cellPx || editor.style.width === "") {
        ui.cellPx = cW;
        sizeCanvasTo(editor, pixelSize, pixelSize);
        dirty = true;
    }

    if (!dirty) {
        return;
    }

    // note that we increased our render count
    ui.editorState += 1;

    const ctx = editor.getContext('2d', {alpha: false});
    ctx.drawImage(block.getSource(editor.width, colors), 0, 0);
}

/**
 * Determine initial number of cells in a quilt rendering.
 */
function createRenderData(quilt: Quilt): RenderData {
    const hasSash = quilt.sash.levels !== SASH_NONE;
    const blockCells = quilt.block.getSize();
    let borderUnits = 0;

    for (const border of quilt.borders) {
        borderUnits += border.cellWidth;
    }

    // "Border units" is in half-cells, so figure out the pixel size based on blockSize.
    // Determine the number of cells horizontally and vertically.  This is determining the total
    // border: borderUnits=1 means 1/2 cell * 2 sides.  Sashing goes between blocks only, and it
    // is a fixed 1-cell width for the moment.  Thus, it adds blocks-1 cells to each dimension
    // when present.
    const cHoriz = (blockCells * BLOCKS_HORIZ + borderUnits + (hasSash ? BLOCKS_HORIZ - 1 : 0));
    const cVert = (blockCells * BLOCKS_VERT + borderUnits + (hasSash ? BLOCKS_VERT - 1 : 0));

    return {
        hasSash: hasSash,
        blockCells: blockCells,
        borderUnits: borderUnits,
        cHoriz: cHoriz,
        cVert: cVert
    }
}

/**
 * Complete calculations for RenderData with finalized cellSize information.
 */
function extendRenderData(r: RenderData, cellSize: number): void {
    r.cellSize = cellSize;
    r.padSize = cellSize * r.borderUnits / 2; // half on each side
    r.blockSize = cellSize * r.blockCells;
}

function deepCopy<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

/**
 * Draw scaled blocks into a canvas.
 */
function drawPreviewBlocks(scaled: CanvasImageSource, ctx: CanvasRenderingContext2D, r: RenderData): void {
    // parse render data
    const blockSize = r.blockSize;
    const padSize = r.padSize;
    const sashSize = r.hasSash ? r.cellSize : 0;

    // now draw from the pre-scaled image
    const stepSize = blockSize + sashSize; // common subexpression
    for (let row = 0, oY = padSize; row < BLOCKS_VERT; row++) {
        for (let col = 0, oX = padSize; col < BLOCKS_HORIZ; col++) {
            ctx.drawImage(scaled, oX, oY);
            oX += stepSize; // next column
        }
        oY += stepSize; // next row
    }
}

function drawPreviewBorders(prevState: Array<Border> | null, ctx: CanvasRenderingContext2D, r: RenderData, canvasSize: Rect): void {
    let oX = 0;
    let oY = 0;
    let w = canvasSize.w;
    let h = canvasSize.h;

    const borders = quilt.borders;
    for (let i = 0; i < borders.length; i++) {
        const border = borders[i];
        const viewBorder = prevState && i < prevState.length ? prevState[i] : null;

        // skip everything if this border is not visible
        if (border.cellWidth === 0) {
            continue;
        }

        // determine the border sizes
        const delta = border.cellWidth * r.cellSize; // full border space
        const strip = delta / 2; // space of one strip of the border

        // if this is a full redraw or the border has changed, repaint it
        if (!border.equals(viewBorder)) {
            // draw an outer edge, then inner edge, then fill even-odd so that
            // only the actual border pixels get painted. overdraws vastly
            // fewer pixels than our old fillRect() code.
            ctx.beginPath();
            ctx.rect(oX, oY, w, h);
            ctx.rect(oX + strip, oY + strip, w - delta, h - delta);
            ctx.closePath();

            ctx.fillStyle = border.color;
            ctx.fill("evenodd");
        }

        // adjust next drawing area
        oX += strip;
        oY += strip;
        w -= delta;
        h -= delta;
    }
}

function drawPreviewSash(vs: SashInfo | null, ctx: CanvasRenderingContext2D, sash: SashInfo, r: RenderData, canvasSize: Rect): void {
    if (sash.levels === SASH_NONE) {
        return;
    }

    const sashSpacing = r.cellSize;
    const blockSize = r.blockSize;
    const padSize = r.padSize;
    const borderSize = 2 * padSize;
    const viewColors = vs && vs.levels === sash.levels ? vs.colors : [];
    const drawMain = !(vs && viewColors && viewColors[0] === sash.colors[0]);
    const stepSize = blockSize + sashSpacing;
    const padStepSize = padSize + stepSize;

    // draw main sashing
    if (drawMain) {
        ctx.fillStyle = sash.colors[0];
        for (let col = 1, oX = padStepSize; col < BLOCKS_HORIZ; col++) {
            ctx.fillRect(oX - sashSpacing, padSize, sashSpacing, canvasSize.h - borderSize);
            oX += stepSize;
        }
        for (let row = 1, oY = padStepSize; row < BLOCKS_VERT; row++) {
            ctx.fillRect(padSize, oY - sashSpacing, canvasSize.w - borderSize, sashSpacing);
            oY += stepSize;
        }
    }

    // draw cross sashing, if applicable
    if (sash.levels !== SASH_DOUBLE) {
        return;
    } else if (!drawMain && viewColors && viewColors[1] === sash.colors[1]) {
        // cross sashing neither changed nor drawn over
        return;
    }
    ctx.fillStyle = sash.colors[1];
    for (let col = 1, oX = padStepSize; col < BLOCKS_HORIZ; col++) {
        for (let row = 1, oY = padStepSize; row < BLOCKS_VERT; row++) {
            // draw cross sash: above left of current point
            ctx.fillRect(oX - sashSpacing, oY - sashSpacing, sashSpacing, sashSpacing);
            oY += stepSize;
        }
        oX += stepSize;
    }
}

function updatePreview(source: HTMLCanvasElement, quilt: Quilt): void {
    // shorten some names
    const sash = quilt.sash;

    // get initial render data
    const r = createRenderData(quilt);

    // calculate draw dimensions
    const cellSize = Math.floor(Math.min(PREVIEW_MAX_WIDTH / r.cHoriz, PREVIEW_MAX_HEIGHT / r.cVert) / 2) * 2;

    // finish up the render data
    extendRenderData(r, cellSize);

    let fullRedraw = (typeof view.quilt === "undefined");
    if (fullRedraw) {
        view.quilt = newQuilt();
    }
    const viewQuilt = view.quilt;

    // resize the canvas to the draw dimensions if needed
    const layout = `${cellSize},${r.cHoriz},${r.cVert},${r.hasSash ? 'sash' : 'noSash'}`;
    if (layout !== view.layout) {
        view.layout = layout;
        sizeCanvasTo(preview, cellSize * r.cHoriz, cellSize * r.cVert);
        fullRedraw = true; // resizing clears the canvas, so we need to paint everything
    }

    // start drawing
    const ctx = preview.getContext('2d', {alpha: false});
    const DPR = preview.width / (cellSize * r.cHoriz);
    ctx.save();
    ctx.scale(DPR, DPR);
    const canvasSize = new Rect(cellSize * r.cHoriz, cellSize * r.cVert);

    // draw changes to borders
    drawPreviewBorders(fullRedraw ? null : viewQuilt.borders, ctx, r, canvasSize);
    viewQuilt.borders = deepCopy(quilt.borders);

    // draw main sashing, if applicable
    if (r.hasSash) {
        drawPreviewSash(fullRedraw ? null : viewQuilt.sash, ctx, sash, r, canvasSize);
        viewQuilt.sash = deepCopy(sash);
    } else if (viewQuilt.sash.levels !== SASH_NONE) {
        viewQuilt.sash = newSash();
    }

    // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
    // by sashing if specified
    if (fullRedraw || ui.editorState !== view.editorState) {
        drawPreviewBlocks(quilt.block.getScaledSource(r.blockSize), ctx, r);
        view.editorState = ui.editorState;
    }

    ctx.restore();
}

/**
 * Draw a large-size preview and return the canvas
 */
function renderDownload(source: HTMLCanvasElement, quilt: Quilt): HTMLCanvasElement {
    // offscreen canvas
    const canvas = document.createElement('canvas');

    // calculate draw dimensions
    const s = createRenderData(quilt);

    // we determine the canvas size here, so let's make something reasonably large.
    const cellSize = Math.max(12, Math.ceil(DOWNLOAD_MIN_HEIGHT / s.cVert / 2) * 2);
    canvas.width = cellSize * s.cHoriz;
    canvas.height = cellSize * s.cVert;

    // finish cellSize-dependent calculations
    extendRenderData(s, cellSize);

    // start drawing
    const ctx = canvas.getContext('2d', {alpha: false});
    const canvasSize = new Rect(canvas.width, canvas.height);
    drawPreviewBorders(null, ctx, s, canvasSize);
    if (s.hasSash) {
        drawPreviewSash(null, ctx, quilt.sash, s, canvasSize);
    }
    drawPreviewBlocks(quilt.block.getScaledSource(s.blockSize), ctx, s);

    return canvas;
}

function updateView(): void {
    updateEditor(quilt.colorSet, quilt.block);
    updatePreview(editor, quilt);
}

if (editor && preview) {
    try {
        initJs();
    } catch (e) {
        document.getElementById('jsInitError').className = '';
        document.getElementById('app').className = 'hide';
    }
} else {
    console.error("Can't get editor and preview; doing nothing.");
}
