import Pickr from "@simonwep/pickr";
import { Color, Move, Quilt, Rect, Sashes } from "./model";
import { TabGroup } from "./tabs";

export enum Tool {
    Paint,
    SpinR,
    FlipH,
    SpinL,
    FlipV,
}

export enum Click {
    Ignore,
    Allow,
}

export class ViewData {
    editorState: number = -1;
    layout: string = "N/A";
    quilt: Quilt = new Quilt();
}

export class RenderData {
    /** Quilt data being rendered */
    readonly quilt: Quilt;
    /** Width of the border, in cell halves */
    readonly borderUnits: number;
    /** Whether the sashing should be displayed at all */
    readonly hasSash: boolean;
    /** Total width/height of the quilt, in cells */
    readonly cells: Rect;

    /**
     * Number of pixels of a single cell, determined by callback
     *
     * This is also the width and height of the sashing (1 cell.)
     */
    readonly cellSize: number;
    /** Per-edge border width, in pixels */
    readonly padSize: number;
    /** Width (= height) of a single quilt block, in pixels */
    readonly blockSize: number;
    /** Size of the entire canvas, in pixels */
    readonly canvasSize: Rect;

    constructor(quilt: Quilt, cellSizeFn: (cells: Rect) => number) {
        const shape = quilt.shape;
        const blockCells = quilt.blockCells;

        this.quilt = quilt;
        this.hasSash = quilt.sash.levels !== Sashes.None;

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
        this.cells = new Rect(
            blockCells * shape.w + borderUnits + (this.hasSash ? shape.w - 1 : 0),
            blockCells * shape.h + borderUnits + (this.hasSash ? shape.h - 1 : 0),
        );

        // okay, now that we have cell dimensions, call the cellSizeFn to get pixel information
        this.cellSize = cellSizeFn(this.cells);
        this.padSize = (this.cellSize * this.borderUnits) / 2; // half on each side
        this.blockSize = this.cellSize * blockCells;

        // calculate pixel dimensions, as px/cell * cells
        this.canvasSize = this.cells.scale(this.cellSize);
    }
}

export class UI {
    /** currently selected block index */
    editorBlock: number = 0;
    /** generation of the editor, incremented on changes */
    editorState: number = 0;
    /** editor cell size in pixels (width & height) */
    cellPx: number = 0;
    /** tabs (editor/preview) */
    tabs: TabGroup | null = null;
    /** whether clicks on Pickr elements should be passed into Pickr */
    colorEvents: Click = Click.Allow;
    /** HTML template for new colors */
    colorTemplate: HTMLTemplateElement | null = null;
    /** HTML template for new borders */
    borderTemplate: HTMLTemplateElement | null = null;
    /** Current guide color, shown between squares in the block editor */
    guideColor: string = "";
    /** Primary and secondary paint colors */
    paintColors: [number, number] = [1, 0];
    /** Currently active tool ID */
    selectedTool: Tool = Tool.Paint;
    /** Whether the selectedTool handles mousemove gracefully (Move.ALLOW) */
    moveStatus: Move = Move.Allow;
}

export class PickrHandle {
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
