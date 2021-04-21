module.exports = {
  dst: 'compiled/lib',
  lib: {
    'bootstrap': 'node_modules/bootstrap/dist/js/bootstrap.bundle.j*',
    'jquery': ['node_modules/jquery/dist/jquery.js', 'node_modules/jquery/dist/jquery.slim.js'],
    'photoswipe': ['node_modules/photoswipe/dist/*', '!node_modules/photoswipe/dist/*.min.js'],
    'photoswipe/default-skin': 'node_modules/photoswipe/dist/default-skin',
  }
}