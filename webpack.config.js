const Encore = require("@symfony/webpack-encore");
const path = require("path");

// Manually configure the runtime environment if not already configured yet by the "encore" command.
// It's useful when you use tools that rely on webpack.config.js file.
if (!Encore.isRuntimeEnvironmentConfigured()) {
    Encore.configureRuntimeEnvironment(process.env.NODE_ENV || "dev");
}

Encore
    // directory where compiled assets will be stored
    .setOutputPath("dist/build/")
    // public path used by the web server to access the output path
    .setPublicPath("/build")
    // only needed for CDN's or sub-directory deploy
    //.setManifestKeyPrefix('build/')

    /*
     * ENTRY CONFIG
     *
     * Each entry will result in one JavaScript file (e.g. app.js)
     * and one CSS file (e.g. app.css) if your JavaScript imports CSS.
     */
    .addEntry("app", "./src/app.ts")

    // enables the Symfony UX Stimulus bridge (used in assets/bootstrap.js)
    //.enableStimulusBridge('./assets/controllers.json')

    // When enabled, Webpack "splits" your files into smaller pieces for greater optimization.
    //.splitEntryChunks()

    // will require an extra script tag for runtime.js
    // but, you probably want this, unless you're building a single-page app
    //.enableSingleRuntimeChunk()
    // either enable or disable method needs to be called
    .disableSingleRuntimeChunk()

    /*
     * FEATURE CONFIG
     *
     * Enable & configure other features below. For a full
     * list of features, see:
     * https://symfony.com/doc/current/frontend.html#adding-more-features
     */
    .cleanupOutputBeforeBuild()
    .enableBuildNotifications()
    .enableSourceMaps(true)
    // enables hashed filenames (e.g. app.abc123.css)
    //.enableVersioning(Encore.isProduction())

    //*
    .configureBabel(undefined, { includeNodeModules: ["@simonwep/pickr"] })
    /*/
    .configureBabel(
        (config) => {
            // config.plugins.push("@babel/plugin-transform-[...]");
            // if we weren't using preset-env (see next configure method)
        },
        {
            includeNodeModules: ["@simonwep/pickr"],
        },
    ) // */
    .configureBabelPresetEnv((config) => {
        // enables @babel/preset-env polyfills
        config.useBuiltIns = "usage";
        config.corejs = 3.22;
    })

    //.enableSassLoader()
    //.enableReactPreset()
    //.autoProvidejQuery()

    // uncomment to get integrity="..." attributes on your script & link tags
    // requires WebpackEncoreBundle 1.4 or higher
    //.enableIntegrityHashes(Encore.isProduction())

    // uncomment if you use TypeScript
    .enableTypeScriptLoader();

// and now, shenanigans: to give Pickr ES6 the modern plugin list
const config = Encore.getWebpackConfig();
// annoying fixup for PHPStorm
if (!config.resolve) {
    config.resolve = {};
} else if (!config.resolve.alias) {
    config.resolve.alias = {};
}
// actual work: redirect the proposal-FOO to transform-FOO
const fragments = ["class-properties", "object-rest-spread"];
for (const name of fragments) {
    config.resolve.alias[`@babel/plugin-proposal-${name}`] = path.resolve(
        __dirname,
        `node_modules/@babel/plugin-transform-${name}`,
    );
}

module.exports = config;
