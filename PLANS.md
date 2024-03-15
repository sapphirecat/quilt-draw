# Plans and Ideas for Quilt Draw

What could be next?  Anything!
But something from this document is more likely than the alternatives.

## Tools

### Move Tool

Instead of the 4-way buttons in a 3×3 grid,
have a move tool (a hand?) that allows dragging the canvas.

### Floating Tool Preview

Highlight the cell or block to be affected by the current tool.

### Block-Level Tools

Spin and Flip are relevant operations for the entire block,
not only cells.

### More Flexible Guides

Instead of off/solid, add "dots" (cell corners only, like PikoPixel)
and "dashed" line modes.

Is there a reason we didn't use Pickr to select the guide color?
Like so:

    ✅ Guides 🟦

### Selection support

Move, copy, paste, fill, 🌈anything we can imagine🌈

### Undo/Redo

Multi-level undo/redo

## Design Options

### Multiple Blocks

The Blocks tab should let the user add more than one block.
The Quilt tab would then have a way to associate blocks,
whether that's a simple A/B checkerboard (and 2-block limit) at first,
or a complete set of tools for putting blocks on the preview.

Copy/paste would be useful,
or at least a Duplicate to New Block operation.

### On-the-Point Mode

Add a "quilt background color,"
and paint blocks rotated at 45° on the preview.

### Flexible Sashing

Various ideas:

- "Horizontal Only" and "Vertical Only" option (vs "Main" on/off)
- Non-square blocks, allowing fake sashing by integrating it into a 4x5 block.
- Window-box pattern (vs "Cross" which puts squares at the intersections)

## Load/Save

As quilts get more complex,
it would be nice to be able to save and restore them.
Even if this is only using local storage at first.

## Physical construction assistance

- Size estimator: if a square (cell) is 3 inches, what size is the whole quilt?
- Yardage estimator
