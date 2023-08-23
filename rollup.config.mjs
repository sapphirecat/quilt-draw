import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/app.ts',
    output: [
        {
            file: 'dist/app.js',
            format: 'iife',
            name: 'QuiltDraw',
            exports: 'none',
        },
    ],
    plugins: [
        typescript(),
        terser(),
    ],
};
