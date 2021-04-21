# eses
Ejs Scss ES6 template builder, to create html template

## Installation
`npm i eses --save-dev`

## Features
- ejs template
- scss styling
- es6
- autoprefixer
- watch & live reload
- libraries copier
- options to use sass(js) or dart-sass

## Commands
package.json:
```json
"scripts": {
  "dev": "eses --dev",
  "build": "eses",
  "lib": "eses --lib"
}
```

`npm run build`\
`npm run dev`\
`npm run lib`

## Default configuration
eses.config.js:
```javascript
module.exports = {
  path: {
    html: {
      src: 'source/ejs',
      dst: 'compiled/html',
    },
    css: {
      src: 'source/scss',
      dst: 'compiled/css',
    },
    js: {
      src: 'source/js',
      dst: 'compiled/js',
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    watch: 'compiled',
    verbose: false,
  },
  useDartSass: false
}
```
## Example libraries
eses.libraries.js:
```javascript
module.exports = {
  dst: 'compiled/lib',
  lib: {
    'bootstrap': 'node_modules/bootstrap/dist/js/bootstrap.bundle.j*',
    'jquery': ['node_modules/jquery/dist/jquery.js', 'node_modules/jquery/dist/jquery.slim.js'],
    'photoswipe': ['node_modules/photoswipe/dist/*', '!node_modules/photoswipe/dist/*.min.js'],
    'photoswipe/default-skin': 'node_modules/photoswipe/dist/default-skin',
  }
}
```