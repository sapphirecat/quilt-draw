/*! QuiltDraw 1.2.0 AGPL-3.0-or-later | https://github.com/sapphirecat/quilt-draw */
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}
class Rect {
    constructor(w, h) {
        this.w = w;
        this.h = h;
    }
}
class Border {
    constructor(cellWidth, color) {
        this.cellWidth = cellWidth;
        this.color = color;
    }
    equals(other) {
        return other && this.cellWidth === other.cellWidth && this.color === other.color;
    }
}
class Palette extends Array {
    equals(other) {
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
    copy() {
        return new Palette(...this);
    }
}
class Cell {
    constructor(top, right, bottom, left) {
        this.colors = [top, right, bottom, left];
    }
    copy() {
        return new Cell(...this.colors);
    }
    rotateCW() {
        const c = this.colors;
        this.colors = [c[3], c[0], c[1], c[2]];
        return this;
    }
    rotateCCW() {
        const c = this.colors;
        this.colors = [c[1], c[2], c[3], c[0]];
        return this;
    }
    flipHoriz() {
        const c = this.colors;
        this.colors = [c[0], c[3], c[2], c[1]];
        return this;
    }
    flipVert() {
        const c = this.colors;
        this.colors = [c[2], c[1], c[0], c[3]];
        return this;
    }
}
class CellList extends Array {
    copy() {
        return new CellList(...this.map(v => v.copy()));
    }
    getSize() {
        return Math.floor(Math.sqrt(this.length));
    }
}
class BlockInfo {
    constructor(cells) {
        this.cells = cells;
        this.dirty = true;
        this.savedCells = cells.copy();
        this.canvas = document.createElement('canvas');
    }
    getSize() {
        return this.cells.getSize();
    }
    isDirty() {
        return this.dirty;
    }
    setDirty() {
        this.dirty = true;
    }
    getSource(pixelSize, colors) {
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
        if (this.dirty) {
            this.draw(colors);
        }
        return this.canvas;
    }
    getScaledSource(scaledSize) {
        if (this.dirty) {
            this.draw(this.lastColors);
        }
        const target = document.createElement('canvas');
        target.width = scaledSize;
        target.height = scaledSize;
        const ctx = target.getContext('2d', { alpha: false });
        ctx.drawImage(this.canvas, 0, 0, scaledSize, scaledSize);
        return target;
    }
    spinCell(i, reverse) {
        if (i >= this.cells.length) {
            return;
        }
        if (reverse) {
            this.cells[i].rotateCCW();
        }
        else {
            this.cells[i].rotateCW();
        }
        this.dirty = true;
    }
    flipCell(i, vertical) {
        if (i >= this.cells.length) {
            return;
        }
        if (vertical) {
            this.cells[i].flipVert();
        }
        else {
            this.cells[i].flipHoriz();
        }
        this.dirty = true;
    }
    paintSubCell(i, j, color) {
        if (i >= this.cells.length || j > 3) {
            return;
        }
        if (this.cells[i].colors[j] === color) {
            return;
        }
        this.cells[i].colors[j] = color;
        this.dirty = true;
    }
    resize(toSize) {
        const currentSize = this.cells.getSize();
        if (toSize === currentSize) {
            return;
        }
        this.saveCurrentCells();
        if (toSize > currentSize) {
            this.resizeUp(currentSize, toSize);
            if (this.savedCells.getSize() < toSize) {
                this.savedCells = this.cells.copy();
            }
        }
        else {
            this.resizeDown(toSize);
        }
        this.dirty = true;
    }
    saveCurrentCells() {
        const saved = this.savedCells;
        const current = this.cells;
        const currentSize = current.getSize();
        const savedSize = saved.getSize();
        if (savedSize <= currentSize) {
            this.savedCells = this.cells.copy();
            return;
        }
        const skip = savedSize - currentSize;
        for (let row = 0, i = 0, j = 0; row < currentSize; row++) {
            for (let col = 0; col < currentSize; col++) {
                saved[j++] = current[i++];
            }
            j += skip;
        }
    }
    rollLeft() {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row, (col + 1) % sz];
        });
    }
    rollRight() {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row, col ? col - 1 : sz - 1];
        });
    }
    rollUp() {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [(row + 1) % sz, col];
        });
    }
    rollDown() {
        const sz = this.cells.getSize();
        this.roll(function (row, col) {
            return [row ? row - 1 : sz - 1, col];
        });
    }
    resizeUp(currentSize, toSize) {
        const current = this.cells;
        const saved = this.savedCells;
        const savedSize = saved.getSize();
        const fillSize = Math.min(savedSize, toSize);
        const output = new CellList(toSize * toSize);
        let row, col, siCurrent, siSaved;
        let di = 0;
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
        for (siSaved = row * savedSize; row < fillSize; row++) {
            for (col = 0; col < savedSize; col++) {
                output[di++] = saved[siSaved++];
            }
            for (; col < toSize; col++) {
                output[di++] = randomCell();
            }
        }
        for (; row < toSize; row++) {
            for (col = 0; col < toSize; col++) {
                output[di++] = randomCell();
            }
        }
        this.cells = output;
    }
    resizeDown(toSize) {
        const input = this.cells;
        const output = new CellList(toSize * toSize);
        const skip = this.cells.getSize() - toSize;
        let di = 0;
        let si = 0;
        for (let row = 0; row < toSize; row++) {
            for (let col = 0; col < toSize; col++) {
                output[di++] = input[si++];
            }
            si += skip;
        }
        this.cells = output;
    }
    roll(mappingFn) {
        const output = new CellList(this.cells.length);
        const size = this.cells.getSize();
        let i = 0;
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const [readRow, readCol] = mappingFn(row, col);
                output[i++] = this.cells[readCol + (readRow * size)];
            }
        }
        this.cells = output;
        this.savedCells = new CellList();
        this.dirty = true;
    }
    draw(colors) {
        const cells = this.cells;
        const size = cells.getSize();
        const cellPx = this.canvas.width / size;
        let oX, oY, iBlock;
        const ctx = this.canvas.getContext('2d', { alpha: false });
        iBlock = 0;
        for (let cY = 0; cY < size; ++cY) {
            oY = cY * cellPx;
            for (let cX = 0; cX < size; ++cX) {
                oX = cX * cellPx;
                drawCellAt(ctx, oX, oY, cellPx, colors, cells[iBlock++]);
            }
        }
        this.dirty = false;
    }
}
class Quilt {
    constructor(block, borders, colorSet, sash) {
        this.block = block;
        this.borders = borders;
        this.colorSet = colorSet;
        this.sash = sash;
    }
}
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const guideType = document.getElementById('guide-type');
let EDITOR_DRAW_WIDTH = editor.width;
const EDITOR_MAX_WIDTH = 540;
let PREVIEW_DRAW_WIDTH = preview.width;
let PREVIEW_DRAW_HEIGHT = preview.height;
const PREVIEW_MIN_RESIZE = 500;
const PREVIEW_MAX_RESIZE = 1000;
const DOWNLOAD_MIN_HEIGHT = 1400;
const BLOCKS_HORIZ = 4;
const BLOCKS_VERT = 5;
const BORDER_LIMIT = 6;
const COLOR_LIMIT = 12;
const SASH_NONE = 0;
const SASH_SINGLE = 1;
const SASH_DOUBLE = 2;
const POINTER_EVENTS = 'PointerEvent' in window;
const MOVE_IGNORE = 0;
const MOVE_ALLOW = 1;
const MOVE_TRACKING = 2;
const CLICK_ALLOW = 0;
const CLICK_IGNORE = 1;
const TOOL_PAINT = 'paint';
const TOOL_SPIN = 'spin';
const TOOL_FLIP = 'flip';
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
    cellPx: 0,
    colorEvents: CLICK_ALLOW,
    colorTemplate: null,
    colorBox: null,
    borderTemplate: null,
    guideColor: "",
    moveStatus: MOVE_ALLOW,
    paintColors: [1, 0],
    selectedTool: TOOL_PAINT
};
const view = {
    layout: "NA",
};
function newSash() {
    return {
        levels: SASH_NONE,
        colors: ['#001', '#002'],
    };
}
function newQuilt() {
    return new Quilt(new BlockInfo(new CellList()), [], new Palette(), newSash());
}
function showActiveColor(slot) {
    const view = document.getElementById(`colorActive${slot}`);
    if (view) {
        const colorIndex = ui.paintColors[slot];
        view.style.backgroundColor = quilt.colorSet[colorIndex];
    }
    else {
        console.error('No element for #colorActive%d', slot);
    }
}
function setChecked(id, checked = true) {
    try {
        const el = document.getElementById(id);
        el.checked = checked;
    }
    catch (e) {
        console.error(e);
    }
}
function setPaintColor(i, slot = 0) {
    let paints = ui.paintColors;
    if (slot === undefined) {
        slot = 0;
    }
    else if (slot < 0 || slot > paints.length) {
        console.error('invalid slot; paint color %d rejected', slot);
        return;
    }
    const prev = paints[slot];
    paints[slot] = i;
    for (let s = 0; s < paints.length; s++) {
        if (paints[s] === i) {
            showActiveColor(s);
        }
    }
    ui.selectedTool = TOOL_PAINT;
    setChecked('tool-paint');
    if (ui.moveStatus === MOVE_IGNORE) {
        ui.moveStatus = MOVE_ALLOW;
    }
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove('selected');
        document.getElementById(`color${i}`).classList.add('selected');
    }
}
function randomColor() {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 35);
    const lns = 35 + Math.floor(Math.random() * 40);
    return `hsla(${hue}, ${sat}%, ${lns}%, 1.0)`;
}
function randomCell() {
    const colorCount = Math.floor(quilt.colorSet.length);
    return new Cell((Math.floor(Math.random() * colorCount)), (Math.floor(Math.random() * colorCount)), (Math.floor(Math.random() * colorCount)), (Math.floor(Math.random() * colorCount)));
}
function getPalette(element) {
    if (!element) {
        return new Palette('#00ccff');
    }
    let colorText = element.getAttribute('data-initial-palette') || '#ff00ff';
    const modeSep = colorText.indexOf("|");
    if (modeSep > -1) {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            colorText = colorText.substring(modeSep + 1);
        }
        else {
            colorText = colorText.substring(0, modeSep);
        }
    }
    const colors = colorText.split(/,\s*/);
    return new Palette(...colors);
}
function isChecked(id) {
    const node = document.getElementById(id);
    return node && node.checked;
}
function initJs() {
    initColors();
    initBorders();
    initTools();
    initQuiltBlock();
    document.getElementById('app').className = '';
    window.addEventListener('resize', onResizeViewport);
    onResizeViewport();
}
function initQuiltBlock() {
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
function initTools() {
    const colorItems = document.getElementById('color-items');
    if (POINTER_EVENTS) {
        editor.addEventListener('pointerdown', onEditorMouse);
        editor.addEventListener('pointerup', onEditorMouseRelease);
        editor.addEventListener('pointercancel', onEditorMouseRelease);
        colorItems.addEventListener('pointerdown', onPaletteDown, { capture: true });
        colorItems.addEventListener('click', onPaletteClick, { capture: true });
    }
    else {
        editor.addEventListener('mousedown', onEditorMouse);
        editor.addEventListener('mouseup', onEditorMouseRelease);
        colorItems.addEventListener('mousedown', onPaletteDown, { capture: true });
        colorItems.addEventListener('click', onPaletteClick, { capture: true });
    }
    editor.addEventListener('contextmenu', (ev) => ev.preventDefault());
    colorItems.addEventListener('contextmenu', (ev) => ev.preventDefault());
    setChecked('tool-paint');
    const nodeList = document.querySelectorAll('.controls, #transforms input[type=range]');
    for (let i = 0; i < nodeList.length; i++) {
        nodeList[i].addEventListener('click', onControlClick);
    }
    initSashColors();
    if (isChecked('sash-on')) {
        quilt.sash.levels = isChecked('sash-cross-on') ? SASH_DOUBLE : SASH_SINGLE;
    }
    initGuides();
}
function initBorders() {
    ui.borderTemplate = document.getElementById('border-item');
    getPalette(ui.borderTemplate).forEach(addBorder);
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
function initSashColors() {
    const colors = getPalette(document.getElementById('sashing'));
    const targets = ['main-sash-color', 'cross-sash-color'];
    if (colors.length !== targets.length) {
        console.error("Sash palette length %d does not match UI element count %d", colors.length, targets.length);
        return;
    }
    for (let i = 0; i < targets.length; i++) {
        const node = document.getElementById(targets[i]);
        if (!node) {
            console.error(`Target element id=${targets[i]} not found`);
            break;
        }
        addSashColor(i, node, colors[i]);
    }
}
function initGuides() {
    if (guideType) {
        ui.guideColor = guideType.value;
        guideType.addEventListener('change', updateGuideColor);
        guideType.addEventListener('keyup', updateGuideColor);
    }
}
function initColors() {
    ui.colorTemplate = document.getElementById('color-item');
    ui.colorBox = document.getElementById('color-items');
    if (!(ui.colorTemplate && ui.colorBox)) {
        console.error("Invalid HTML: missing template#color-item or #colors");
        return;
    }
    getPalette(ui.colorBox).forEach(addColor);
    const colorIndex = Math.min(ui.paintColors[0], quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).classList.add('selected');
        showActiveColor(0);
    }
    showActiveColor(1);
    document.getElementById('color-new').addEventListener('click', createColor);
}
function createColor() {
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
function newColorPicker(button, value) {
    return new Pickr({
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
        i18n: {
            "btn:cancel": "Reset",
            "aria:btn:cancel": "Reset and keep open"
        }
    });
}
function addColor(value) {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true);
    const button = item.querySelector('.color-button');
    if (!button) {
        console.error("Cannot find '.color-button' in ui.colorTemplate");
        return;
    }
    const dataNode = button.parentElement;
    dataNode.setAttribute('data-color-id', `${i}`);
    dataNode.id = `color${i}`;
    quilt.colorSet[i] = value;
    const picker = newColorPicker(button, value);
    picker.on('change', newValue => onColorChanged(i, newValue));
    picker.on('hide', () => onColorPickerHide(i));
    picker.on('cancel', () => onColorReset(i));
    ui.colorBox.appendChild(item);
    pickers[i] = {
        handle: picker,
        saved: value,
    };
    return i;
}
function onColorPickerHide(i) {
    pickers[i].saved = quilt.colorSet[i];
    pickers[i].handle.applyColor(true);
    document.getElementById('color-items').focus({ preventScroll: true });
    setPaintColor(i);
}
function onColorChanged(i, value) {
    quilt.colorSet[i] = value.toHSLA().toString();
    updateView();
}
function onColorReset(i) {
    quilt.colorSet[i] = pickers[i].saved;
    updateView();
}
function onSashColorPickerHide(i) {
    pickers[`sash.${i}`].saved = quilt.sash.colors[i];
    pickers[`sash.${i}`].handle.applyColor(true);
}
function onSashColorChanged(i, value) {
    quilt.sash.colors[i] = value.toHSLA().toString();
    updatePreview(editor, quilt);
}
function onSashColorReset(i) {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(editor, quilt);
}
function addSashColor(i, button, value) {
    const picker = newColorPicker(button, value);
    picker.on('change', newValue => onSashColorChanged(i, newValue));
    picker.on('hide', () => onSashColorPickerHide(i));
    picker.on('cancel', () => onSashColorReset(i));
    pickers[`sash.${i}`] = { handle: picker, saved: value };
    quilt.sash.colors[i] = value;
}
function onBorderColorPickerHide(i) {
    pickers[`border.${i}`].saved = quilt.borders[i].color;
    pickers[`border.${i}`].handle.applyColor(true);
}
function onBorderColorChanged(i, value) {
    quilt.borders[i].color = value.toHSLA().toString();
    updatePreview(editor, quilt);
}
function onBorderColorReset(i) {
    quilt.borders[i].color = pickers[`border.${i}`].saved;
    updatePreview(editor, quilt);
}
function addBorder(color) {
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
    range.value = `${border.cellWidth}`;
    const picker = newColorPicker(item.querySelector(".color-button"), border.color);
    picker.on('change', newValue => onBorderColorChanged(i, newValue));
    picker.on('hide', () => onBorderColorPickerHide(i));
    picker.on('cancel', () => onBorderColorReset(i));
    quilt.borders[i] = border;
    pickers[`border.${i}`] = { handle: picker, saved: border.color };
    ui.borderTemplate.parentElement.appendChild(item);
}
function isButtonRelevant(ev) {
    return !!(ev.buttons && ev.buttons < 3);
}
function isPrimaryButton(ev) {
    return ev.buttons === 1;
}
function isSecondaryButton(ev) {
    return ev.buttons === 2;
}
function editorClearMoveHandler() {
    editor.removeEventListener(POINTER_EVENTS ? 'pointermove' : 'mousemove', onEditorMouse);
    ui.moveStatus = MOVE_ALLOW;
}
function editorSetMoveHandler() {
    ui.moveStatus = MOVE_TRACKING;
    editor.addEventListener(POINTER_EVENTS ? 'pointermove' : 'mousemove', onEditorMouse);
}
function onEditorMouseRelease(ev) {
    ev.preventDefault();
    if (ui.moveStatus !== MOVE_IGNORE) {
        editorClearMoveHandler();
    }
}
function onEditorMouse(ev) {
    if (ev.buttons && !isButtonRelevant(ev)) {
        return;
    }
    ev.preventDefault();
    if (!ev.buttons) {
        editorClearMoveHandler();
        return;
    }
    if (ui.moveStatus === MOVE_ALLOW) {
        editorSetMoveHandler();
    }
    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;
    const sz = quilt.block.getSize();
    const cellPx = editor.width / sz;
    const index = _(x / cellPx) + (sz * _(y / cellPx));
    const isSecondaryClick = isSecondaryButton(ev);
    switch (ui.selectedTool) {
        case TOOL_PAINT:
            const top = _(index / sz) * cellPx;
            const left = _(index % sz) * cellPx;
            const hitX = x - left;
            const hitY = y - top;
            const quadrantKey = `${hitX > hitY ? "A" : "B"}${hitX > (cellPx - hitY) ? "X" : "Y"}`;
            const colorIndex = CELL_QUADRANTS[quadrantKey];
            const colorChosen = ui.paintColors[isSecondaryClick ? 1 : 0];
            quilt.block.paintSubCell(index, colorIndex, colorChosen);
            break;
        case TOOL_SPIN:
            quilt.block.spinCell(index, isSecondaryClick);
            break;
        case TOOL_FLIP:
            quilt.block.flipCell(index, isSecondaryClick);
            break;
        default:
            console.error("Unknown tool selected: %s", ui.selectedTool);
    }
    updateView();
}
function onBorderSize(ev) {
    if (!(ev.target instanceof HTMLInputElement)) {
        return;
    }
    const i = parseInt(ev.target.getAttribute('data-border-index') || '0', 10) || 0;
    quilt.borders[i].cellWidth = parseInt(ev.target.value, 10);
    updatePreview(editor, quilt);
}
function onControlClick(ev) {
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
    }
    else if (classes.contains('sash-select')) {
        onSashChange(ev);
    }
    else if (classes.contains('tool-active')) {
        onToolChange(ev);
    }
    else if (classes.contains('roll')) {
        onRollerClick(ev);
    }
    else if (classes.contains('download')) {
        onDownload(ev);
    }
}
function onPaletteDown(ev) {
    ui.colorEvents = CLICK_ALLOW;
    if (!isButtonRelevant(ev)) {
        return;
    }
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
        }
        else {
            node = node.parentElement;
        }
    }
    if (!(found && node instanceof HTMLElement)) {
        console.error("label element not found in event stack");
        return;
    }
    const colorIndex = parseInt(node.getAttribute('data-color-id'), 10);
    if (isPrimaryButton(ev) && colorIndex === ui.paintColors[0]) {
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    ui.colorEvents = CLICK_IGNORE;
    setPaintColor(colorIndex, isSecondaryButton(ev) ? 1 : 0);
}
function onPaletteClick(ev) {
    if (ui.colorEvents === CLICK_IGNORE) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    ui.colorEvents = CLICK_ALLOW;
}
function onToolChange(ev) {
    const node = ev.target;
    if (!(node instanceof HTMLElement)) {
        return;
    }
    ui.selectedTool = node.id.replace(/^tool-/, '');
    if (ui.moveStatus === MOVE_TRACKING) {
        editorClearMoveHandler();
    }
    ui.moveStatus = node.getAttribute('data-move-tracking') === '1' ? MOVE_ALLOW : MOVE_IGNORE;
}
function onSashChange(ev) {
    if (ev.defaultPrevented) {
        return;
    }
    const main = document.getElementById('sash-on');
    const cross = document.getElementById('sash-cross-on');
    quilt.sash.levels = main.checked ? (cross.checked ? SASH_DOUBLE : SASH_SINGLE) : SASH_NONE;
    updatePreview(editor, quilt);
}
function onDownload(ev) {
    const node = ev.target;
    ev.preventDefault();
    if (!(node instanceof HTMLButtonElement)) {
        return;
    }
    const isPreview = node.id === 'download-preview';
    const source = isPreview ? renderDownload(editor, quilt) : editor;
    const basename = isPreview ? 'quilt' : 'block';
    const link = document.createElement('a');
    link.setAttribute('href', source.toDataURL('image/png'));
    link.setAttribute('download', `${basename}.png`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function onRollerClick(ev) {
    const movers = {
        "roll-up": (b) => b.rollUp(),
        "roll-down": (b) => b.rollDown(),
        "roll-left": (b) => b.rollLeft(),
        "roll-right": (b) => b.rollRight()
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
function onResizeInput(ev) {
    const node = ev.target;
    if (!(node instanceof HTMLInputElement)) {
        return;
    }
    const newSize = parseInt(node.value, 10);
    quilt.block.resize(newSize);
    updateView();
}
function onResizeViewport() {
    const width = Math.min(window.innerWidth, 1600);
    const height = window.innerHeight;
    let gridWidth = (width - 20) * 0.4;
    gridWidth -= gridWidth % 30;
    let gridHeight = height - 24;
    gridHeight -= gridHeight % 24;
    const heightWidth = Math.floor(gridHeight * (BLOCKS_HORIZ / BLOCKS_VERT));
    const previewHeight = Math.ceil(Math.min(gridWidth, heightWidth) * (BLOCKS_VERT / BLOCKS_HORIZ));
    PREVIEW_DRAW_HEIGHT = Math.min(Math.max(previewHeight, PREVIEW_MIN_RESIZE), PREVIEW_MAX_RESIZE);
    PREVIEW_DRAW_WIDTH = Math.floor(PREVIEW_DRAW_HEIGHT * (BLOCKS_HORIZ / BLOCKS_VERT));
    EDITOR_DRAW_WIDTH = Math.max(360, PREVIEW_DRAW_WIDTH - 24);
    if (EDITOR_DRAW_WIDTH > EDITOR_MAX_WIDTH) {
        EDITOR_DRAW_WIDTH = EDITOR_MAX_WIDTH;
    }
    else {
        EDITOR_DRAW_WIDTH -= EDITOR_DRAW_WIDTH % 60;
    }
    updateView();
}
function sizeCanvasTo(canvas, width, height) {
    const DPR = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = "${width}px";
    canvas.style.height = "${height}px";
}
function drawTriangle(ctx, points, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}
function drawRect(ctx, point, rect, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(point.x, point.y, rect.w, rect.h);
}
function drawCellAt(ctx, oX, oY, cellPx, palette, cell) {
    const half = cellPx / 2;
    const tl = new Point(oX, oY);
    const tr = new Point(oX + cellPx, oY);
    const bl = new Point(oX, oY + cellPx);
    const br = new Point(oX + cellPx, oY + cellPx);
    const c = new Point(oX + half, oY + half);
    const ml = new Point(oX, oY + half);
    const rect = new Rect(cellPx, half);
    drawRect(ctx, tl, rect, palette[cell.colors[0]]);
    drawRect(ctx, ml, rect, palette[cell.colors[2]]);
    drawTriangle(ctx, [c, tr, br], palette[cell.colors[1]]);
    drawTriangle(ctx, [c, bl, tl], palette[cell.colors[3]]);
}
function updateGuideColor() {
    if (!guideType) {
        return;
    }
    const block = quilt.block;
    if (guideType.value !== ui.guideColor && guideType.value === '') {
        block.setDirty();
        updateEditor(quilt.colorSet, block);
    }
    else {
        drawGuides(block);
    }
}
function isGuideDirty() {
    return guideType.value !== ui.guideColor;
}
function drawGuides(block, ctx) {
    if (!ctx && !isGuideDirty()) {
        return;
    }
    else if (guideType.value === "") {
        ui.guideColor = "";
        return;
    }
    if (!ctx) {
        ctx = editor.getContext('2d');
    }
    const cW = ui.cellPx;
    const cellCount = block.getSize();
    const pixelSize = cW * cellCount;
    ctx.save();
    try {
        let at = -0.5;
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
    }
    catch (e) {
        console.error(e);
    }
    ctx.restore();
}
function updateEditor(colors, block) {
    const cellCount = block.getSize();
    let dirty = block.isDirty();
    const cW = 2 * Math.floor(EDITOR_DRAW_WIDTH / cellCount / 2);
    const pixelSize = cW * cellCount;
    if (cW !== ui.cellPx || editor.style.width === "") {
        ui.cellPx = cW;
        sizeCanvasTo(editor, pixelSize, pixelSize);
        dirty = true;
    }
    if (!dirty) {
        drawGuides(block);
        return;
    }
    ui.editorState += 1;
    const ctx = editor.getContext('2d', { alpha: false });
    ctx.drawImage(block.getSource(editor.width, colors), 0, 0);
    drawGuides(block, ctx);
}
function createRenderData(quilt) {
    const hasSash = quilt.sash.levels !== SASH_NONE;
    const blockCells = quilt.block.getSize();
    let borderUnits = 0;
    for (const border of quilt.borders) {
        borderUnits += border.cellWidth;
    }
    const cHoriz = (blockCells * BLOCKS_HORIZ + borderUnits + (hasSash ? BLOCKS_HORIZ - 1 : 0));
    const cVert = (blockCells * BLOCKS_VERT + borderUnits + (hasSash ? BLOCKS_VERT - 1 : 0));
    return {
        hasSash: hasSash,
        blockCells: blockCells,
        borderUnits: borderUnits,
        cHoriz: cHoriz,
        cVert: cVert
    };
}
function extendRenderData(r, cellSize) {
    r.cellSize = cellSize;
    r.padSize = cellSize * r.borderUnits / 2;
    r.blockSize = cellSize * r.blockCells;
}
function deepCopy(x) {
    return JSON.parse(JSON.stringify(x));
}
function drawPreviewBlocks(scaled, ctx, r) {
    const blockSize = r.blockSize;
    const padSize = r.padSize;
    const sashSize = r.hasSash ? r.cellSize : 0;
    const stepSize = blockSize + sashSize;
    for (let row = 0, oY = padSize; row < BLOCKS_VERT; row++) {
        for (let col = 0, oX = padSize; col < BLOCKS_HORIZ; col++) {
            ctx.drawImage(scaled, oX, oY);
            oX += stepSize;
        }
        oY += stepSize;
    }
}
function drawPreviewBorders(prevState, ctx, r, canvasSize) {
    let oX = 0;
    let oY = 0;
    let w = canvasSize.w;
    let h = canvasSize.h;
    const borders = quilt.borders;
    for (let i = 0; i < borders.length; i++) {
        const border = borders[i];
        const viewBorder = prevState && i < prevState.length ? prevState[i] : null;
        if (border.cellWidth === 0) {
            continue;
        }
        const delta = border.cellWidth * r.cellSize;
        const strip = delta / 2;
        if (!border.equals(viewBorder)) {
            ctx.beginPath();
            ctx.rect(oX, oY, w, h);
            ctx.rect(oX + strip, oY + strip, w - delta, h - delta);
            ctx.closePath();
            ctx.fillStyle = border.color;
            ctx.fill("evenodd");
        }
        oX += strip;
        oY += strip;
        w -= delta;
        h -= delta;
    }
}
function drawPreviewSash(vs, ctx, sash, r, canvasSize) {
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
    if (sash.levels !== SASH_DOUBLE) {
        return;
    }
    else if (!drawMain && viewColors && viewColors[1] === sash.colors[1]) {
        return;
    }
    ctx.fillStyle = sash.colors[1];
    for (let col = 1, oX = padStepSize; col < BLOCKS_HORIZ; col++) {
        for (let row = 1, oY = padStepSize; row < BLOCKS_VERT; row++) {
            ctx.fillRect(oX - sashSpacing, oY - sashSpacing, sashSpacing, sashSpacing);
            oY += stepSize;
        }
        oX += stepSize;
    }
}
function updatePreview(source, quilt) {
    const sash = quilt.sash;
    const r = createRenderData(quilt);
    const cellSize = Math.floor(Math.min(PREVIEW_DRAW_WIDTH / r.cHoriz, PREVIEW_DRAW_HEIGHT / r.cVert) / 2) * 2;
    extendRenderData(r, cellSize);
    let fullRedraw = (typeof view.quilt === "undefined");
    if (fullRedraw) {
        view.quilt = newQuilt();
    }
    const viewQuilt = view.quilt;
    const layout = `${cellSize},${r.cHoriz},${r.cVert},${r.hasSash ? 'sash' : 'noSash'}`;
    if (layout !== view.layout) {
        view.layout = layout;
        sizeCanvasTo(preview, cellSize * r.cHoriz, cellSize * r.cVert);
        fullRedraw = true;
    }
    const ctx = preview.getContext('2d', { alpha: false });
    const DPR = preview.width / (cellSize * r.cHoriz);
    ctx.save();
    ctx.scale(DPR, DPR);
    const canvasSize = new Rect(cellSize * r.cHoriz, cellSize * r.cVert);
    drawPreviewBorders(fullRedraw ? null : viewQuilt.borders, ctx, r, canvasSize);
    viewQuilt.borders = deepCopy(quilt.borders);
    if (r.hasSash) {
        drawPreviewSash(fullRedraw ? null : viewQuilt.sash, ctx, sash, r, canvasSize);
        viewQuilt.sash = deepCopy(sash);
    }
    else if (viewQuilt.sash.levels !== SASH_NONE) {
        viewQuilt.sash = newSash();
    }
    if (fullRedraw || ui.editorState !== view.editorState) {
        drawPreviewBlocks(quilt.block.getScaledSource(r.blockSize), ctx, r);
        view.editorState = ui.editorState;
    }
    ctx.restore();
}
function renderDownload(source, quilt) {
    const canvas = document.createElement('canvas');
    const s = createRenderData(quilt);
    const cellSize = Math.max(12, Math.ceil(DOWNLOAD_MIN_HEIGHT / s.cVert / 2) * 2);
    canvas.width = cellSize * s.cHoriz;
    canvas.height = cellSize * s.cVert;
    extendRenderData(s, cellSize);
    const ctx = canvas.getContext('2d', { alpha: false });
    const canvasSize = new Rect(canvas.width, canvas.height);
    drawPreviewBorders(null, ctx, s, canvasSize);
    if (s.hasSash) {
        drawPreviewSash(null, ctx, quilt.sash, s, canvasSize);
    }
    drawPreviewBlocks(quilt.block.getScaledSource(s.blockSize), ctx, s);
    return canvas;
}
function updateView() {
    updateEditor(quilt.colorSet, quilt.block);
    updatePreview(editor, quilt);
}
if (editor && preview) {
    try {
        initJs();
    }
    catch (e) {
        document.getElementById('jsInitError').className = '';
        document.getElementById('app').className = 'hide';
    }
}
else {
    console.error("Can't get editor and preview; doing nothing.");
}
