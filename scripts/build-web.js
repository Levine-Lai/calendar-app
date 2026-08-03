const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const publicDir = path.join(root, "public");
const prototypeBrandingPattern =
  /^assets\/branding\/(?:runner-(?:running|motion-study)-|app-logo-)/;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.copyFileSync(path.join(root, "index.html"), path.join(outDir, "index.html"));
fs.cpSync(publicDir, path.join(outDir, "public"), {
  recursive: true,
  filter(source) {
    const relative = path.relative(publicDir, source).replaceAll("\\", "/");
    return !prototypeBrandingPattern.test(relative);
  }
});

console.log("Built static app into www/");
