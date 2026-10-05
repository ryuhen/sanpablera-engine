const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = process.cwd();

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    // Modelos 3D. Sin esto el navegador rechaza el .glb y el personaje
    // humanoide no llega a cargar (ver assets/ATTRIBUTIONS.md).
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.ktx2': 'image/ktx2',
    '.basis': 'application/octet-stream',
    '.fbx': 'application/octet-stream'
};

http.createServer((req, res) => {
    let cleanUrl = req.url.split('?')[0];
    let filePath = path.join(PUBLIC_DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);
    let extname = String(path.extname(filePath)).toLowerCase();
    let contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 No encontrado</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Error interno: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`Servidor local corriendo en http://localhost:${PORT}`);
});
