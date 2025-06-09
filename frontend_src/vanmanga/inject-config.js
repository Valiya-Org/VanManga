/**
 * The script is used in preparation to statically serve the application in /dist
 *
 * Injects front-end configuration properties in dist/index.html after building. This is used for Docker Images where the configuration file is provided only after the Vue app is compiled.
 */
const fs = require('fs');
const htmlFile = './static/templates/index.html';
const configFile = './public/config.json';
if (!fs.existsSync(htmlFile)) {
    console.warn(`The project is not compiled (${htmlFile} is missing for post-compilation config injection)`);
    return;
}
if (!fs.existsSync(configFile)) {
    console.warn(`Configuration file ${configFile} is missing for post-compilation config injection`);
    return;
}
const html = fs.readFileSync(htmlFile).toString();
const config = require(configFile);
const configVariablePattern = /<script>const APP_CONFIG = .*;<\/script>/g;
const newConfigVariable = '<script>const APP_CONFIG = ' + JSON.stringify(config) + ';</script>';
const injectedHtml = html.replace(configVariablePattern, newConfigVariable);
fs.writeFileSync(htmlFile, injectedHtml);