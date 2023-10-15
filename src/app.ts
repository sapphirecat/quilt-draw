/*! QuiltDraw 2.0.0 AGPL-3.0-or-later | https://github.com/sapphirecat/quilt-draw */
/*
 * QuiltDraw - Quarter-Square Triangle Designer
 * Copyright © 2020–2023 sapphirecat <devel@sapphirepaw.org>
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

import Pickr from "@simonwep/pickr";

const editor = document.getElementById("editor") as HTMLCanvasElement;
const preview = document.getElementById("preview") as HTMLCanvasElement;
const miniPreview = document.getElementById("mini-preview") as HTMLCanvasElement;
const guideType = document.getElementById("guide-type") as HTMLSelectElement;

let EDITOR_DRAW_WIDTH = editor.width;
const EDITOR_MAX_WIDTH = 630; // HACK: this is specified in our CSS
// no EDITOR_DRAW/MAX_HEIGHT: it is square.

let PREVIEW_DRAW_WIDTH = preview.width;
let PREVIEW_DRAW_HEIGHT = preview.height;
const PREVIEW_MIN_HEIGHT = 600;
const PREVIEW_MAX_HEIGHT = 1200;

let MINI_PREVIEW_DRAW_WIDTH = miniPreview.width;
let MINI_PREVIEW_DRAW_HEIGHT = miniPreview.height;
const MINI_PREVIEW_MIN_HEIGHT = 300;
const MINI_PREVIEW_MAX_HEIGHT = 630;

const DOWNLOAD_MIN_HEIGHT = 1400;

const BLOCKS_HORIZ = 4; // number of block copies across the preview
const BLOCKS_VERT = 5; // number of block copies down the preview

const BORDER_LIMIT = 6; // maximum number of borders that may be added
const COLOR_LIMIT = 12; // maximum number of colors in the palette

const POINTER_EVENTS = "PointerEvent" in window;
const POINTER_MOVE = POINTER_EVENTS ? "pointermove" : "mousemove";

/**
 * Lookup table for calculating cell hits. A = top/right side, B = bottom/left;
 * X = bottom/right, Y = top/left.  AY = intersect(A, Y) = top.  The value in
 * this object is the index into the Cell.colors for the sub-area that was hit.
 * That is, we calculate A-or-B, and X-or-Y, then look up the results here to
 * determine which triangle gets painted.
 */
const CELL_QUADRANTS = {
    AY: 0,
    AX: 1,
    BX: 2,
    BY: 3,
};

type Color = string;
type SashColors = [Color, Color];
type PaintSlot = 0 | 1;

enum Move {
    Ignore, // tool does not allow holding mouse down
    Allow, // tool supports holding mouse down, but handler is inactive
    Tracking, // mouse is down, and event handler is active
}

enum Click {
    Ignore,
    Allow,
}

enum Tool {
    Paint,
    Spin,
    Flip,
}

enum Sashes {
    None, // no sashing
    Single, // all one color
    Double, // second color at intersections
}

class SashInfo {
    levels: Sashes = Sashes.None;
    colors: SashColors = ["#001", "#002"];
}

class ViewData {
    editorState: number = -1;
    layout: string = "N/A";
    quilt: Quilt = newQuilt();
    miniLayout: string = "N/A";
    miniQuilt: Quilt = newQuilt();
}

class Point {
    constructor(
        readonly x: number,
        readonly y: number,
    ) {}
}

class Rect {
    constructor(
        readonly w: number,
        readonly h: number,
    ) {}
}

class Border {
    constructor(
        public cellWidth: number,
        public color: Color,
    ) {}

    equals(other: Border | undefined | null) {
        return other && this.cellWidth === other.cellWidth && this.color === other.color;
    }
}

class RenderData {
    /** Width of the border, in cell halves */
    borderUnits: number;
    /** Width (= height) of the single quilt block, in cells */
    blockCells: number;
    /** Whether the sashing should be displayed at all */
    hasSash: boolean;
    /** Total width of the quilt, in cells */
    cHoriz: number;
    /** Total height of the quilt, in cells */
    cVert: number;

    /**
     * Number of pixels of a single cell, determined by callback
     *
     * This is also the width and height of the sashing (1 cell.)
     */
    cellSize: number;
    /** Per-edge border width, in pixels */
    padSize: number;
    /** Width (= height) of a single quilt block, in pixels */
    blockSize: number;

    constructor(quilt: Quilt, cellSizeFn: (cH: number, cV: number) => number) {
        this.hasSash = quilt.sash.levels !== Sashes.None;
        this.blockCells = quilt.block.getSize();

        // sum up the border sizes to get the total border units
        let borderUnits = 0;
        for (const border of quilt.borders) {
            borderUnits += border.cellWidth;
        }
        this.borderUnits = borderUnits;

        // "Border units" is in half-cells, so figure out the pixel size based on blockSize.
        // Determine the number of cells horizontally and vertically.  This is determining the total
        // border: borderUnits=1 means 1/2 cell * 2 sides.  Sashing goes between blocks only, and it
        // is a fixed 1-cell width for the moment.  Thus, it adds blocks-1 cells to each dimension
        // when present.
        this.cHoriz =
            this.blockCells * BLOCKS_HORIZ + borderUnits + (this.hasSash ? BLOCKS_HORIZ - 1 : 0);
        this.cVert =
            this.blockCells * BLOCKS_VERT + borderUnits + (this.hasSash ? BLOCKS_VERT - 1 : 0);

        // okay, now that we have cell dimensions, call the cellSizeFn to get pixel information
        this.cellSize = cellSizeFn(this.cHoriz, this.cVert);
        this.padSize = (this.cellSize * this.borderUnits) / 2; // half on each side
        this.blockSize = this.cellSize * this.blockCells;
    }

    resizeCanvas(canvas: HTMLCanvasElement, ignoreDPR?: boolean) {
        // calculate pixel dimensions, as px/cell * cells
        const width = this.cellSize * this.cHoriz;
        const height = this.cellSize * this.cVert;
        sizeCanvasTo(canvas, width, height, ignoreDPR);
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

    rotateCW(): this {
        const c = this.colors;
        this.colors = [c[3], c[0], c[1], c[2]];
        return this;
    }

    rotateCCW(): this {
        const c = this.colors;
        this.colors = [c[1], c[2], c[3], c[0]];
        return this;
    }

    flipHoriz(): this {
        const c = this.colors;
        this.colors = [c[0], c[3], c[2], c[1]];
        return this;
    }

    flipVert(): this {
        const c = this.colors;
        this.colors = [c[2], c[1], c[0], c[3]];
        return this;
    }
}

class CellList extends Array<Cell> {
    copy(): CellList {
        return new CellList(...this.map((v) => v.copy()));
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
        this.canvas = document.createElement("canvas");
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

        const target = document.createElement("canvas");
        target.width = scaledSize;
        target.height = scaledSize;

        const ctx = target.getContext("2d", { alpha: false });
        ctx.drawImage(this.canvas, 0, 0, scaledSize, scaledSize);
        return target;
    }

    spinCell(i: number, reverse?: boolean): void {
        if (i >= this.cells.length) {
            return;
        }

        if (reverse) {
            this.cells[i].rotateCCW();
        } else {
            this.cells[i].rotateCW();
        }

        this.dirty = true;
    }

    flipCell(i: number, vertical?: boolean): void {
        if (i >= this.cells.length) {
            return;
        }

        if (vertical) {
            this.cells[i].flipVert();
        } else {
            this.cells[i].flipHoriz();
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

    rollLeft(): void {
        const sz = this.cells.getSize();
        this.roll(function (row: number, col: number) {
            return [row, (col + 1) % sz];
        });
    }

    rollRight(): void {
        const sz = this.cells.getSize();
        this.roll(function (row: number, col: number) {
            return [row, col ? col - 1 : sz - 1];
        });
    }

    rollUp(): void {
        const sz = this.cells.getSize();
        this.roll(function (row: number, col: number) {
            return [(row + 1) % sz, col];
        });
    }

    rollDown(): void {
        const sz = this.cells.getSize();
        this.roll(function (row: number, col: number) {
            return [row ? row - 1 : sz - 1, col];
        });
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

    private roll(mappingFn: (row: number, col: number) => [number, number]): void {
        const output = new CellList(this.cells.length);
        const size = this.cells.getSize();

        // walk across output in order. ask the mapping function where the data
        // for the row/column of output is located in the source, by row/column.
        let i = 0;
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const [readRow, readCol] = mappingFn(row, col);
                output[i++] = this.cells[readCol + readRow * size];
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
        const ctx = this.canvas.getContext("2d", { alpha: false });

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
    constructor(
        public block: BlockInfo,
        public borders: Array<Border>,
        public colorSet: Palette,
        public sash: SashInfo,
    ) {}
}

class PickrHandle {
    constructor(
        public handle: Pickr,
        public saved: Color,
    ) {}

    /**
     * Save the selected color to the picker, for use on the next reset event.
     *
     * Typically called when Pickr is popped down, by clicking outside of it.
     *
     * @param newColor Color that has been selected
     */
    saveColor(newColor: Color) {
        this.saved = newColor; // remember the color for Reset
        this.handle.applyColor(true); // apply without firing the event
    }
}

type CustomEventFn = (ev: CustomEvent) => void;

class TabGroup {
    current: string = "";
    private handles: Map<string, TabHandle>;
    private listeners: Map<string, Set<CustomEventFn>>;

    constructor(public name: string) {
        this.handles = new Map();
        this.listeners = new Map();
    }

    addHandle(handle: TabHandle) {
        // extra paranoia to make sure tab our initializer is invalid
        if (handle.name === "") {
            throw new Error("Tab name is required");
        }

        // store the handle by its name
        this.handles.set(handle.name, handle);

        // display first tab / hide subsequent tabs
        if (this.current === "") {
            this.select(handle.name);
        } else {
            handle.deactivate();
        }
    }

    select(name: string) {
        if (name === this.current) {
            return;
        }

        for (const handle of this.handles.values()) {
            handle.name === name ? handle.activate() : handle.deactivate();
        }

        const prevName = this.current;
        this.current = name;
        this.emit("change", { name: prevName });
    }

    addEventListener(name: string, fn: CustomEventFn) {
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set([fn]));
        } else {
            this.listeners.get(name).add(fn);
        }
    }

    removeEventListener(name: string, fn: CustomEventFn) {
        this.listeners.get(name)?.delete(fn);
    }

    private emit(name: string, data: any) {
        if (!this.listeners.has(name)) {
            return;
        }

        for (const fn of this.listeners.get(name).values()) {
            const ev = new CustomEvent(name, { detail: data });
            fn(ev);
        }
    }
}

class TabHandle {
    constructor(
        public name: string,
        public header: Element,
        public region: Element,
    ) {}

    activate() {
        this.header.classList.add("active");
        this.region.classList.remove("hide");
    }

    deactivate() {
        this.header.classList.remove("active");
        this.region.classList.add("hide");
    }
}

const pickers: { [key: string]: PickrHandle } = {};

const quilt = newQuilt();

interface UI {
    editorState: number; // generation of the editor, incremented on changes
    cellPx: number; // editor cell size in pixels (width & height)
    colorEvents: number; // whether clicks on Pickr elements should be passed into Pickr
    moveStatus: Move; // Whether the tool handles mousemove gracefully (Move.ALLOW)
    selectedTool: Tool; // Currently active tool ID
    paintColors: [number, number]; // Primary and secondary paint colors
    guideColor: Color; // Current guide color, shown between squares in the block editor
    borderTemplate: HTMLTemplateElement | null; // HTML template for new borders
    colorTemplate: HTMLTemplateElement | null; // HTML template for new colors
    tabs: TabGroup | null;
}

const ui: UI = {
    editorState: 0,
    cellPx: 0,
    tabs: null,
    colorEvents: Click.Allow,
    colorTemplate: null,
    borderTemplate: null,
    guideColor: "",
    moveStatus: Move.Allow,
    paintColors: [1, 0],
    selectedTool: Tool.Paint,
};

const toolForId: { [key: string]: Tool } = {
    "tool-paint": Tool.Paint,
    "tool-spin": Tool.Spin,
    "tool-flip": Tool.Flip,
};

const view = new ViewData();

function arrayEquals(a: any[], b: any[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

function newQuilt(): Quilt {
    return new Quilt(new BlockInfo(new CellList()), [], new Palette(), new SashInfo());
}

/**
 * Update the display of currently-selected paint colors.
 */
function showActiveColor(slot: number): void {
    const view = document.getElementById(`color-active-${slot}`);
    if (view) {
        const colorIndex = ui.paintColors[slot];
        view.style.backgroundColor = quilt.colorSet[colorIndex];
    } else {
        console.error("No element for '#color-active-%d'", slot);
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
 * @param {PaintSlot} [slot] A slot number to set, or the primary slot (0) by default.
 */
function setPaintColor(i: number, slot: PaintSlot = 0): void {
    const paints = ui.paintColors;
    const prev = paints[slot];

    paints[slot] = i;
    for (let s = 0; s < paints.length; s++) {
        if (paints[s] === i) {
            showActiveColor(s);
        }
    }

    // activate the tool
    ui.selectedTool = Tool.Paint;
    setChecked("tool-paint");
    if (ui.moveStatus === Move.Ignore) {
        ui.moveStatus = Move.Allow;
    }

    // move the selection hint for primary color only
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove("selected");
        document.getElementById(`color${i}`).classList.add("selected");
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
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
    );
}

function getPalette(element?: Element): Palette {
    // we have some sentinel color values in here, to detect major errors in
    // script initialization.  we should never see these.
    if (!element) {
        return new Palette("#00ccff");
    }

    let colorText = element.getAttribute("data-initial-palette") || "#ff00ff";

    // process "light-mode|dark-mode" formatting
    const modeSep = colorText.indexOf("|");
    if (modeSep > -1) {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            colorText = colorText.substring(modeSep + 1);
        } else {
            colorText = colorText.substring(0, modeSep);
        }
    }

    // now apply the (sub)palette we chose
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

    const tabs = initTabs();
    if (tabs) {
        tabs.addEventListener("change", onTabChange);
        ui.tabs = tabs;
    }

    // un-hide JS content
    document.getElementById("app").classList.remove("hide");

    // set up semi-fluid UI
    window.addEventListener("resize", onResizeViewport);
    onResizeViewport();
}

function initQuiltBlock(): void {
    // get initial size from the HTML
    const sizeInput = document.getElementById("cell-size");
    const size =
        sizeInput && sizeInput instanceof HTMLInputElement ? parseInt(sizeInput.value, 10) : 5;
    const cells = new CellList();

    for (let column = 0; column < size; column++) {
        for (let row = 0; row < size; row++) {
            cells.push(randomCell());
        }
    }

    quilt.block = new BlockInfo(cells);
}

function initTools(): void {
    const colorItems = document.getElementById("color-items");

    // Pointer-related events: try Pointer, fall back to Mouse.
    if (POINTER_EVENTS) {
        // set up editor
        editor.addEventListener("pointerdown", onEditorMouse);
        editor.addEventListener("pointerup", onEditorMouseRelease);
        editor.addEventListener("pointercancel", onEditorMouseRelease);

        // set up main controls
        // we still get a click event, so we use ui.colorEvents to ignore one
        // if it follows a mousedown we took responsibility for.
        colorItems.addEventListener("pointerdown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    } else {
        editor.addEventListener("mousedown", onEditorMouse);
        editor.addEventListener("mouseup", onEditorMouseRelease);

        colorItems.addEventListener("mousedown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    }

    // set up the remaining (non-pointer) editor and color-picker events
    editor.addEventListener("contextmenu", (ev) => ev.preventDefault());
    colorItems.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // pre-select the paint tool to match the script state
    setChecked("tool-paint");

    // wire in the rest of the controls' events
    const nodeList = document.querySelectorAll(
        ".controls, #transforms input[type=range]",
    ) as NodeListOf<HTMLElement>;
    for (let i = 0; i < nodeList.length; i++) {
        nodeList[i].addEventListener("click", onControlClick);
    }

    // set up sashing colors
    initSashColors();
    if (isChecked("sash-on")) {
        quilt.sash.levels = isChecked("sash-cross-on") ? Sashes.Double : Sashes.Single;
    }

    // set up guide state
    initGuides();
}

function initBorders(): void {
    // create the default border
    ui.borderTemplate = document.getElementById("border-item") as HTMLTemplateElement;
    getPalette(ui.borderTemplate).forEach(addBorder);

    // set up events
    const root = ui.borderTemplate.parentElement;
    root.addEventListener("input", onBorderSize);

    const newBorder = () => {
        addBorder();
        updatePreview(quilt);
        if (quilt.borders.length >= BORDER_LIMIT) {
            document.getElementById("border-new").classList.add("hide");
        }
    };
    document.getElementById("border-new").addEventListener("click", newBorder);
}

function initSashColors(): void {
    const colors = getPalette(document.getElementById("sashing"));
    const targets = ["main-sash-color", "cross-sash-color"];
    if (colors.length !== targets.length) {
        console.error(
            "Sash palette length %d does not match UI element count %d",
            colors.length,
            targets.length,
        );
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

function initGuides(): void {
    if (guideType) {
        ui.guideColor = guideType.value;
        guideType.addEventListener("change", updateGuideColor);
        guideType.addEventListener("keyup", updateGuideColor);
    }
}

function initColors(): void {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById("color-item") as HTMLTemplateElement;
    const colorBox = ui.colorTemplate.parentNode;

    // double-check that our requirements are fulfilled
    if (!(ui.colorTemplate && colorBox instanceof Element)) {
        console.error("Invalid HTML: missing *>template#color-item");
        return;
    }

    // parse the initial palette data and create Pickr UI
    // create Pickr UI for each initial palette entry
    getPalette(colorBox).forEach(addColor);

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.paintColors[0], quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).classList.add("selected");
        showActiveColor(0);
    }

    showActiveColor(1);

    // set up "New Color" button
    document.getElementById("color-new").addEventListener("click", createColor);
}

function initTabs(): undefined | TabGroup {
    // The app structure is hard-coded, because I want to get done soon.
    const root = document.getElementById("tabs-app");
    const tabRow = root?.querySelector(":scope > .tabs-select-row");
    if (!(root && tabRow)) {
        return;
    }

    const tabGroups = new TabGroup(root.id);
    const regions = new Map<string, Element>();
    // pre-process the regions so we don't have O(N^2) lookups
    for (const region of root.querySelectorAll(":scope > .tab-region[data-tab-name]")) {
        regions.set(region.getAttribute("data-tab-name"), region);
    }
    // process the tabs, that select the regions
    for (const tab of tabRow.querySelectorAll(":scope > .tab-select[data-tab-name]")) {
        const name = tab.getAttribute("data-tab-name");
        if (!regions.has(name)) {
            console.error("Tab missing related region in %s: %s", root.id, name);
            continue;
        }

        tabGroups.addHandle(new TabHandle(name, tab, regions.get(name)));
    }

    // set event handler on tabRow
    tabRow.addEventListener("click", (ev) => {
        const e = ev.target;
        ev.preventDefault();

        if (!(e instanceof HTMLElement) || e.classList.contains("active")) {
            return;
        }

        const name = e.getAttribute("data-tab-name");
        if (name) {
            tabGroups.select(name);
        }
    });

    return tabGroups;
}

function createColor(): void {
    if (quilt.colorSet.length >= COLOR_LIMIT) {
        alert("That's just too many colors.");
        return;
    }

    const i = addColor(randomColor());
    setPaintColor(i);

    if (i + 1 >= COLOR_LIMIT) {
        document.getElementById("color-new").classList.add("hide");
    }
}

function newColorPicker(button: HTMLElement, value: string): Pickr {
    return new Pickr({
        el: button,
        theme: "nano",
        lockOpacity: true,
        default: value,
        defaultRepresentation: "HSLA",
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
                clear: false,
            },
        },

        i18n: {
            "btn:cancel": "Reset",
            "aria:btn:cancel": "Reset and keep open",
        },
    });
}

function addColor(value: string): number | undefined {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true) as Element;

    // configure sub-DOM
    const button = item.querySelector(".color-button") as HTMLElement;
    if (!button) {
        console.error("Cannot find '.color-button' in ui.colorTemplate");
        return;
    }

    const dataNode = button.parentElement; // label.color-item
    dataNode.setAttribute("data-color-id", `${i}`);
    dataNode.id = `color${i}`;

    // define the color
    quilt.colorSet[i] = value;

    // activate the picker
    const picker = newColorPicker(button, value);

    // set up events
    picker.on("change", (newValue: Pickr.HSVaColor) => onColorChanged(i, newValue));
    picker.on("hide", () => onColorPickerHide(i));
    picker.on("cancel", () => onColorReset(i));

    // insert the whole template into the DOM
    ui.colorTemplate.parentNode.appendChild(item);

    // save the picker for future interaction
    pickers[i] = new PickrHandle(picker, value);

    return i;
}

function onColorPickerHide(i: number): void {
    pickers[i].saveColor(quilt.colorSet[i]);
    document.getElementById("color-items").focus({ preventScroll: true });
    setPaintColor(i);
}

function onColorChanged(i: number, value: Pickr.HSVaColor): void {
    quilt.colorSet[i] = value.toHSLA().toString();
    updateView();
}

function onColorReset(i: number): void {
    quilt.colorSet[i] = pickers[i].saved;
    updateView();
}

function onSashColorPickerHide(i: number): void {
    pickers[`sash.${i}`].saveColor(quilt.sash.colors[i]);
}

function onSashColorChanged(i: number, value: Pickr.HSVaColor) {
    quilt.sash.colors[i] = value.toHSLA().toString();
    updatePreview(quilt);
}

function onSashColorReset(i: number): void {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(quilt);
}

function addSashColor(i: number, button: HTMLElement, value: string): void {
    const picker = newColorPicker(button, value);

    picker.on("change", (newValue: Pickr.HSVaColor) => onSashColorChanged(i, newValue));
    picker.on("hide", () => onSashColorPickerHide(i));
    picker.on("cancel", () => onSashColorReset(i));

    pickers[`sash.${i}`] = new PickrHandle(picker, value);
    quilt.sash.colors[i] = value;
}

function onBorderColorPickerHide(i: number): void {
    pickers[`border.${i}`].saveColor(quilt.borders[i].color);
}

function onBorderColorChanged(i: number, value: Pickr.HSVaColor): void {
    quilt.borders[i].color = value.toHSLA().toString();
    updatePreview(quilt);
}

function onBorderColorReset(i: number): void {
    quilt.borders[i].color = pickers[`border.${i}`].saved;
    updatePreview(quilt);
}

/**
 * Add another border layer
 */
function addBorder(color?: string): void {
    if (quilt.borders.length >= BORDER_LIMIT) {
        return;
    }

    const i = quilt.borders.length;
    const item = ui.borderTemplate.content.cloneNode(true) as Element;
    const range = item.querySelector("input[type=range]") as HTMLInputElement;
    const width = 1 + Math.floor(Math.random() * 3);
    const border = new Border(width, color || randomColor());

    item.querySelector("p").appendChild(document.createTextNode(`${i + 1}`));

    range.id = `borderWidth${i}`;
    range.setAttribute("data-border-index", `${i}`);
    range.value = `${border.cellWidth}`;

    const picker = newColorPicker(item.querySelector(".color-button"), border.color);
    // set up events
    picker.on("change", (newValue: Pickr.HSVaColor) => onBorderColorChanged(i, newValue));
    picker.on("hide", () => onBorderColorPickerHide(i));
    picker.on("cancel", () => onBorderColorReset(i));

    // commit changes
    quilt.borders[i] = border;
    pickers[`border.${i}`] = new PickrHandle(picker, border.color);
    ui.borderTemplate.parentElement.appendChild(item);
}

function onTabChange(_ev: CustomEvent) {
    updateView();
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
    editor.removeEventListener(POINTER_MOVE, onEditorMouse);
    ui.moveStatus = Move.Allow;
}

function editorSetMoveHandler(): void {
    ui.moveStatus = Move.Tracking;
    editor.addEventListener(POINTER_MOVE, onEditorMouse);
}

function onEditorMouseRelease(ev: MouseEvent): void {
    ev.preventDefault();
    if (ui.moveStatus !== Move.Ignore) {
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
    if (ui.moveStatus === Move.Allow) {
        editorSetMoveHandler();
    }

    // the BoundingClientRect is relative to the viewport, as are clientX/Y
    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.block.getSize();
    const cellPx = editor.width / sz;
    const index = _(x / cellPx) + sz * _(y / cellPx);

    // act on the hit
    const isSecondaryClick = isSecondaryButton(ev);
    switch (ui.selectedTool) {
        case Tool.Paint:
            // translate coordinates to cell-relative
            const top = _(index / sz) * cellPx;
            const left = _(index % sz) * cellPx;
            const hitX = x - left;
            const hitY = y - top;

            // determine which quadrant of the cell was hit
            const quadrantKey = `${hitX > hitY ? "A" : "B"}${hitX > cellPx - hitY ? "X" : "Y"}`;
            const colorIndex = CELL_QUADRANTS[quadrantKey as keyof typeof CELL_QUADRANTS];

            // apply color to the index that was hit
            const colorChosen = ui.paintColors[isSecondaryClick ? 1 : 0];
            quilt.block.paintSubCell(index, colorIndex, colorChosen);

            break;
        case Tool.Spin:
            quilt.block.spinCell(index, isSecondaryClick);
            break;
        case Tool.Flip:
            quilt.block.flipCell(index, isSecondaryClick);
            break;
        default:
            const t: never = ui.selectedTool;
            console.error("Unknown tool selected: %d", t);
    }

    updateView();
}

function onBorderSize(ev: Event): void {
    if (!(ev instanceof Event && ev.target instanceof HTMLInputElement)) {
        return;
    }

    const i = parseInt(ev.target.getAttribute("data-border-index") || "0", 10) || 0;
    quilt.borders[i].cellWidth = parseInt(ev.target.value, 10);
    updatePreview(quilt);
}

/**
 * Delegating event handler for control input-radio clicks
 */
function onControlClick(ev: MouseEvent): void {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    if (!target.tagName.match(/^(?:button|input)$/i)) {
        return;
    }

    const classes = target.classList;
    if (classes.contains("resize")) {
        onResizeInput(ev);
    } else if (classes.contains("sash-select")) {
        onSashChange(ev);
    } else if (classes.contains("tool-active")) {
        onToolChange(ev);
    } else if (classes.contains("roll")) {
        onRollerClick(ev);
    } else if (classes.contains("download")) {
        onDownload(ev);
    }
}

/**
 * Capturing event handler for palette
 */
function onPaletteDown(ev: MouseEvent): void {
    ui.colorEvents = Click.Allow; // by default, we do not have full responsibility
    if (!isButtonRelevant(ev) || !(ev.target instanceof HTMLElement)) {
        return; // we don't handle this button/combo
    }

    const node = ev.target.closest("label.color-item");
    if (!(node && node instanceof HTMLElement)) {
        console.error("label.color-item element not found in event stack");
        return;
    }

    const colorIndex = parseInt(node.getAttribute("data-color-id"), 10);

    // if this is a PRIMARY click on a SELECTED color, pass the event through
    // to Pickr. we'll update the color when the picker is closed.
    if (isPrimaryButton(ev) && colorIndex === ui.paintColors[0]) {
        return;
    }

    // SECONDARY click or NON-SELECTED color. Take over the event ourselves.
    ev.preventDefault();
    ev.stopPropagation();
    ui.colorEvents = Click.Ignore; // reject a 'click' if it is also generated
    setPaintColor(colorIndex, isSecondaryButton(ev) ? 1 : 0);
}

function onPaletteClick(ev: MouseEvent): void {
    if (ui.colorEvents === Click.Ignore) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    ui.colorEvents = Click.Allow;
}

function onToolChange(ev: MouseEvent): void {
    const node = ev.target;
    if (!(node instanceof HTMLElement && (node.id || "") in toolForId)) {
        return;
    }
    ui.selectedTool = toolForId[node.id];

    // update movement state
    if (ui.moveStatus === Move.Tracking) {
        editorClearMoveHandler();
    }
    ui.moveStatus = node.getAttribute("data-move-tracking") === "1" ? Move.Allow : Move.Ignore;
}

function onSashChange(ev: MouseEvent): void {
    // do-nothing op to make the event appear used. maintains a consistent
    // interface across all the `onSomeEvent(ev)` functions.
    if (ev.defaultPrevented) {
        return;
    }

    const main = document.getElementById("sash-on") as HTMLInputElement;
    const cross = document.getElementById("sash-cross-on") as HTMLInputElement;

    quilt.sash.levels = main.checked
        ? cross.checked
            ? Sashes.Double
            : Sashes.Single
        : Sashes.None;
    updatePreview(quilt);
}

function onDownload(ev: MouseEvent): void {
    const node = ev.target;
    ev.preventDefault();

    if (!(node instanceof HTMLButtonElement)) {
        return;
    }

    // figure out what we're downloading
    const isPreview = node.id === "download-preview";
    const source = isPreview ? renderDownload(quilt) : editor;
    const basename = isPreview ? "quilt" : "block";

    // generate download
    const link = document.createElement("a");
    link.setAttribute("href", source.toDataURL("image/png"));
    link.setAttribute("download", `${basename}.png`);
    document.body.appendChild(link); // Pale Moon
    link.click();
    document.body.removeChild(link); // Pale Moon
}

/**
 * Roll the quilt block in some direction.
 */
function onRollerClick(ev: MouseEvent): void {
    const movers = {
        "roll-up": (b: BlockInfo) => b.rollUp(),
        "roll-down": (b: BlockInfo) => b.rollDown(),
        "roll-left": (b: BlockInfo) => b.rollLeft(),
        "roll-right": (b: BlockInfo) => b.rollRight(),
    };

    if (!(ev.target instanceof Element)) {
        return;
    }

    const id = ev.target.id as keyof typeof movers;
    const callback = movers[id];
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

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(n, lo));
}

function fitRectH(boundW: number, boundH: number, aspect: number, modPxH: number): number {
    const modPxW = Math.floor(modPxH * aspect);

    // shrink the bounds to wrap the quantum of space the caller wanted
    boundW -= boundW % modPxW;
    boundH -= boundH % modPxH;

    // calculate the width based purely on the actual height
    const altW = Math.floor(boundH * aspect);
    const finalW = Math.min(boundW, altW);

    return Math.ceil(finalW / aspect);
}

function onResizeViewport(): void {
    // HACK: Takes a max-width and grid (3 columns = 2*10px gap) into account
    const width = Math.min(window.innerWidth, 1600) - 20;
    const height = window.innerHeight;
    const previewAspect = BLOCKS_HORIZ / BLOCKS_VERT;
    const modPxH = 30;
    let gridWidth: number;

    // determine the editor's natural size [4fr/9fr]
    gridWidth = width * (4 / 9);
    let editorH = fitRectH(gridWidth, height, 1.0, 12);
    EDITOR_DRAW_WIDTH = Math.min(editorH, EDITOR_MAX_WIDTH);

    // determine the mini preview's natural size [width/3 === *3fr/9fr]
    gridWidth = width / 3;
    const miniH = fitRectH(gridWidth, height, previewAspect, modPxH);
    MINI_PREVIEW_DRAW_HEIGHT = clamp(miniH, MINI_PREVIEW_MIN_HEIGHT, MINI_PREVIEW_MAX_HEIGHT);
    MINI_PREVIEW_DRAW_WIDTH = Math.floor(MINI_PREVIEW_DRAW_HEIGHT * previewAspect);

    // determine the full preview's natural size [7fr/9fr, usually height limited]
    gridWidth = width * (7 / 9);
    const previewH = fitRectH(gridWidth, height, previewAspect, modPxH);
    PREVIEW_DRAW_HEIGHT = clamp(previewH, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT);
    PREVIEW_DRAW_WIDTH = Math.floor(PREVIEW_DRAW_HEIGHT * previewAspect);

    updateView();
}

function sizeCanvasTo(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    ignoreDPR?: boolean,
) {
    const DPR = ignoreDPR ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
}

/**
 * Draw a triangle at coordinates on the canvas.
 */
function drawTriangle(
    ctx: CanvasRenderingContext2D,
    points: Array<Point>,
    fillStyle: string,
): void {
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y); // no line
    ctx.lineTo(points[1].x, points[1].y); // edge 1
    ctx.lineTo(points[2].x, points[2].y); // edge 2
    ctx.closePath(); // edge 3, back to the moveTo

    ctx.fillStyle = fillStyle;
    ctx.fill();
}

/**
 * Draw a rectangle at the coordinates on the canvas.
 */
function drawRect(
    ctx: CanvasRenderingContext2D,
    point: Point,
    rect: Rect,
    fillStyle: string,
): void {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(point.x, point.y, rect.w, rect.h);
}

/**
 * Draw a cell into a coordinate on the canvas.
 */
function drawCellAt(
    ctx: CanvasRenderingContext2D,
    oX: number,
    oY: number,
    cellPx: number,
    palette: Palette,
    cell: Cell,
): void {
    // Determine all coordinates we can draw from: top/left/bottom/right pairs, and center
    const half = cellPx / 2;
    const tl = new Point(oX, oY);
    const tr = new Point(oX + cellPx, oY);
    const bl = new Point(oX, oY + cellPx);
    const br = new Point(oX + cellPx, oY + cellPx);
    const c = new Point(oX + half, oY + half);
    const ml = new Point(oX, oY + half); // mid left
    const rect = new Rect(cellPx, half);

    // Draw all four triangles into place, but eliminate seams by drawing the
    // top and bottom first, but bigger.
    drawRect(ctx, tl, rect, palette[cell.colors[0]]);
    drawRect(ctx, ml, rect, palette[cell.colors[2]]);
    // draw left/right triangles over the edges of the polygons
    drawTriangle(ctx, [c, tr, br], palette[cell.colors[1]]);
    drawTriangle(ctx, [c, bl, tl], palette[cell.colors[3]]);
}

function updateGuideColor(): void {
    if (!guideType || guideType.value === ui.guideColor) {
        return;
    }

    updateEditor(quilt.colorSet, quilt.block);
}

function drawGuides(block: BlockInfo, ctx: CanvasRenderingContext2D): void {
    if (guideType.value === "") {
        // we don't want to draw anything on it
        ui.guideColor = "";

        return;
    }

    const cW = ui.cellPx;
    const cellCount = block.getSize();
    const pixelSize = cW * cellCount;

    ctx.save();
    try {
        let at = 0;
        ctx.strokeStyle = guideType.value;
        ctx.beginPath();
        for (let i = 1; i < cellCount; ++i) {
            at += cW;
            ctx.moveTo(at, 0);
            ctx.lineTo(at, pixelSize);
            ctx.moveTo(0, at);
            ctx.lineTo(pixelSize, at);
        }

        ctx.stroke();

        ui.guideColor = guideType.value;
    } catch (e) {
        console.error(e);
    }
    ctx.restore();
}

/**
 * Draw a block into the editor area of the canvas.
 */
function updateEditor(colors: Palette, block: BlockInfo): void {
    // render the blockInfo into the editor canvas
    const cellCount = block.getSize();
    let dirty = block.isDirty();

    // Resize editor if needed, assuming square
    const cW = 2 * Math.floor(EDITOR_DRAW_WIDTH / cellCount / 2);
    const pixelSize = cW * cellCount;
    if (cW !== ui.cellPx || editor.style.width === "") {
        ui.cellPx = cW;
        sizeCanvasTo(editor, pixelSize, pixelSize);
        dirty = true;
    }

    if (dirty) {
        ui.editorState += 1; // we're redrawing the canvas!
    }

    const ctx = editor.getContext("2d", { alpha: false });
    ctx.drawImage(block.getSource(editor.width, colors), 0, 0);

    // draw on the UI-only state after the block is copied out
    drawGuides(block, ctx);
}

function deepCopy<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

/**
 * Draw scaled blocks into a canvas.
 */
function drawPreviewBlocks(
    scaled: CanvasImageSource,
    ctx: CanvasRenderingContext2D,
    r: RenderData,
): void {
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

function drawPreviewBorders(
    prevState: Array<Border> | null,
    ctx: CanvasRenderingContext2D,
    r: RenderData,
    canvasSize: Rect,
): void {
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

function drawPreviewSash(
    vs: SashInfo | null,
    ctx: CanvasRenderingContext2D,
    sash: SashInfo,
    r: RenderData,
    canvasSize: Rect,
): void {
    if (sash.levels === Sashes.None) {
        return;
    }

    const sashSpacing = r.cellSize;
    const blockSize = r.blockSize;
    const padSize = r.padSize;
    const borderSize = 2 * padSize;
    const viewColors = vs && vs.levels === sash.levels ? vs.colors : ([] as Color[]);
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
    if (sash.levels !== Sashes.Double) {
        return;
    } else if (!drawMain && viewColors.length >= 2 && viewColors[1] === sash.colors[1]) {
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

function updatePreview(quilt: Quilt): void {
    // shorten some names
    const sash = quilt.sash;

    // get initial render data
    const r = new RenderData(
        quilt,
        (cH, cV) => 2 * Math.floor(Math.min(PREVIEW_DRAW_WIDTH / cH, PREVIEW_DRAW_HEIGHT / cV) / 2),
    );
    const cellSize = r.cellSize;

    // resize the canvas to the draw dimensions if needed
    const layout = `${cellSize},${r.cHoriz},${r.cVert},${r.hasSash ? "sash" : "noSash"}`;
    let fullRedraw = layout !== view.layout;
    if (fullRedraw) {
        view.layout = layout;
        r.resizeCanvas(preview);
        // reset "last drawn" to an empty quilt, so that we redraw everything
        view.quilt = newQuilt();
    } else if (
        !view.quilt.colorSet.equals(quilt.colorSet) ||
        (r.hasSash && !arrayEquals(view.quilt.sash.colors, quilt.sash.colors))
    ) {
        // if the palette has changed, redraw everything, but without resizing
        fullRedraw = true;
    }
    const viewQuilt = view.quilt;

    // start drawing
    const ctx = preview.getContext("2d", { alpha: false });
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
    } else if (viewQuilt.sash.levels !== Sashes.None) {
        viewQuilt.sash = new SashInfo();
    }

    // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
    // by sashing if specified
    if (fullRedraw || ui.editorState !== view.editorState) {
        drawPreviewBlocks(quilt.block.getScaledSource(r.blockSize), ctx, r);
        view.editorState = ui.editorState;
    }

    ctx.restore();
}

// TODO: REFACTOR! this is literally updatePreview() duplicated
function updateMiniPreview(quilt: Quilt): void {
    // shorten some names
    const sash = quilt.sash;

    // get initial render data
    const r = new RenderData(
        quilt,
        (cH, cV) =>
            2 *
            Math.floor(Math.min(MINI_PREVIEW_DRAW_WIDTH / cH, MINI_PREVIEW_DRAW_HEIGHT / cV) / 2),
    );
    const cellSize = r.cellSize;

    // resize the canvas to the draw dimensions if needed
    const layout = `${cellSize},${r.cHoriz},${r.cVert},${r.hasSash ? "sash" : "noSash"}`;
    let fullRedraw = layout !== view.miniLayout;
    if (fullRedraw) {
        view.miniLayout = layout;
        r.resizeCanvas(miniPreview);
        // reset "last drawn" to an empty quilt, so that we redraw everything
        view.miniQuilt = newQuilt();
    } else if (
        !view.miniQuilt.colorSet.equals(quilt.colorSet) ||
        (r.hasSash && !arrayEquals(view.miniQuilt.sash.colors, quilt.sash.colors))
    ) {
        // if the palette has changed, redraw everything, but without resizing
        fullRedraw = true;
    }
    const viewQuilt = view.miniQuilt;

    // start drawing
    const ctx = miniPreview.getContext("2d", { alpha: false });
    const DPR = miniPreview.width / (cellSize * r.cHoriz);
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
    } else if (viewQuilt.sash.levels !== Sashes.None) {
        viewQuilt.sash = new SashInfo();
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
function renderDownload(quilt: Quilt): HTMLCanvasElement {
    // offscreen canvas
    const canvas = document.createElement("canvas");

    // calculate draw dimensions
    const s = new RenderData(quilt, (_cH, cV) =>
        Math.max(12, 2 * Math.ceil(DOWNLOAD_MIN_HEIGHT / cV / 2)),
    );
    s.resizeCanvas(canvas, true);

    // start drawing
    const ctx = canvas.getContext("2d", { alpha: false });
    const canvasSize = new Rect(canvas.width, canvas.height);
    drawPreviewBorders(null, ctx, s, canvasSize);
    if (s.hasSash) {
        drawPreviewSash(null, ctx, quilt.sash, s, canvasSize);
    }
    drawPreviewBlocks(quilt.block.getScaledSource(s.blockSize), ctx, s);

    return canvas;
}

function updateView(): void {
    if (ui.tabs.current === "quilt") {
        updatePreview(quilt);
    } else {
        updateEditor(quilt.colorSet, quilt.block);
        updateMiniPreview(quilt);
    }
}

if (editor && preview) {
    const err = document.getElementById("js-init-error");
    try {
        initJs();
        err?.remove();
    } catch (e) {
        console.error(e);

        // if it crashed really late on, re-hide the UI that doesn't have all
        // the necessary events
        const app = document.getElementById("app");
        if (app) {
            app.classList.add("hide");
        }

        // display the error UI
        if (err) {
            err.classList.remove("hide");
        } else {
            alert("It crashed so hard, we can't even display a nice message.");
        }
    }
} else {
    console.error("Can't get editor and preview; doing nothing.");
}
