const BLOCKS_HORIZ = 4; // number of block copies across the preview
const BLOCKS_VERT = 5; // number of block copies down the preview

export type Color = string;
export type SashColors = [Color, Color];

export enum Sashes {
    None, // no sashing
    Single, // all one color
    Double, // second color at intersections
}

export enum GuideType {
    None,
    Grid,
}

export class SashInfo {
    levels: Sashes = Sashes.None;
    colors: SashColors = ["#001", "#002"];
}

export class Point {
    constructor(
        readonly x: number,
        readonly y: number,
    ) {}
}

export class RectBounds {
    constructor(
        readonly w?: number,
        readonly h?: number,
    ) {}

    toString(): string {
        const w = typeof this.w === "number" ? this.w : "-";
        const h = typeof this.h === "number" ? this.h : "-";

        return `${w}×${h}`;
    }
}

export class Rect extends RectBounds {
    constructor(
        readonly w: number,
        readonly h: number,
    ) {
        super(w, h);
    }
    scale(m: number): Rect {
        return new Rect(m * this.w, m * this.h);
    }
}

export class Guide {
    constructor(guideType: string) {
        this.type = guideType;
    }

    private _type: GuideType;

    get type(): GuideType {
        return this._type;
    }

    set type(value: string) {
        if (value === "") {
            this._type = GuideType.None;
        } else {
            this._type = GuideType.Grid;
            this._color = value;
        }
    }

    private _color: Color;

    get color(): Color {
        return this._color;
    }

    equals(other: Guide | undefined | null) {
        return other && this._type === other.type && this._color === other.color;
    }

    copy() {
        const htmlType = this._type === GuideType.Grid ? this._color : "";

        return new Guide(htmlType);
    }
}

export class Border {
    constructor(
        public cellWidth: number,
        public color: Color,
    ) {}

    equals(other: Border | undefined | null) {
        return other && this.cellWidth === other.cellWidth && this.color === other.color;
    }
}

export class Palette extends Array<string> {
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

export class Cell {
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

export class CellList extends Array<Cell> {
    copy(): CellList {
        return new CellList(...this.map((v) => v.copy()));
    }

    getSize(): number {
        return Math.floor(Math.sqrt(this.length));
    }
}

export class BlockInfo {
    private dirty: boolean = true;
    private cells: CellList;
    private readonly canvas: HTMLCanvasElement;
    private lastColors?: Palette;
    private lastPixelSize?: number;
    private savedCells: CellList;

    constructor() {
        this.cells = new CellList();
        this.savedCells = this.cells.copy();
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

    spinCell(i: number, leftward?: boolean): void {
        if (i >= this.cells.length) {
            return;
        }

        if (leftward) {
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

    paintSubCell(i: number, j: 0 | 1 | 2 | 3, color: number): void {
        if (i >= this.cells.length || i < 0 || color < 0) {
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
        // HACK: guess how many colors there are [hard-codes the UI default]
        const nColors = this.lastColors ? this.lastColors.length : 3;

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
                output[di++] = randomCell(nColors);
            }
        }

        // current rows exhausted
        for (siSaved = row * savedSize; row < fillSize; row++) {
            // instead of current, it all comes from saved
            for (col = 0; col < savedSize; col++) {
                output[di++] = saved[siSaved++];
            }
            for (; col < toSize; col++) {
                output[di++] = randomCell(nColors);
            }
        }

        // saved rows exhausted, fill remaining rows with random values
        for (; row < toSize; row++) {
            for (col = 0; col < toSize; col++) {
                output[di++] = randomCell(nColors);
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

export class Quilt {
    /** Individual blocks that make up the quilt */
    blocks: Array<BlockInfo> = [new BlockInfo()];
    /** Borders around the quilt */
    borders: Array<Border> = [];
    /** Palette for cells */
    colorSet: Palette = new Palette();
    /** Sash options */
    sash: SashInfo = new SashInfo();
    /** Width and height of the quilt */
    shape: Rect;
    /** Quilt structure, containing indices of blocks */
    private blockMap: Array<Array<number>>;

    constructor(size?: Rect) {
        this.shape = size || new Rect(BLOCKS_HORIZ, BLOCKS_VERT);
        this.blockMap = this.newBlockMap(this.shape);
    }

    /**
     * Iterate over the rows of the quilt
     *
     * This makes Quilt behave as a 2D array of block-map data.
     *
     * @yields {number[]} Iterable for the columns within each row
     */
    *[Symbol.iterator]() {
        const w = this.shape.w;
        // noinspection UnnecessaryLocalVariableJS
        const h = this.shape.h;

        for (let r = 0; r < h; r++) {
            yield this.blockMap[r].slice(0, w);
        }
    }

    get blockCells(): number {
        return this.blocks[0].getSize();
    }

    set blockCells(size: number) {
        for (const block of this.blocks) {
            block.resize(size);
        }
    }

    resize(toShape: Rect) {
        // block map's width/height
        const bmW = this.blockMap.length;
        const bmH = this.blockMap[0].length;

        // delta width/height
        const dW = toShape.w - bmW;
        const dH = toShape.h - bmH;

        if (dW <= 0 && dH <= 0) {
            // we already have enough size in both dimensions to cover this
            this.shape = toShape;

            return;
        }

        // add columns if we need to add width
        if (dW > 0) {
            for (let r = 0; r < bmH; r++) {
                const items = (new Array(dW)).fill(0);
                this.blockMap[r].push(...items);
            }
        }

        // add rows if we need to add height
        if (dH > 0) {
            const w = Math.max(toShape.w, bmW);
            for (let r = bmH; r < toShape.h; r++) {
                this.blockMap.push((new Array(w)).fill(0));
            }
        }

        // save the new shape
        this.shape = toShape;
    }

    private newBlockMap(size: Rect): Array<Array<number>> {
        const rows = size.h;
        const cols = size.w;

        const m: Array<Array<number>> = [];
        for (let r = 0; r < rows; r++) {
            m.push((new Array(cols)).fill(0));
        }

        return m;
    }
}

/**
 * Generate a random cell structure.
 */
function randomCell(colorCount: number): Cell {
    return new Cell(
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
        Math.floor(Math.random() * colorCount),
    );
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
