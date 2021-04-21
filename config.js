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
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    watch: 'compiled',
    verbose: false,
  },
  useDartSass: false,
  customConfig: 'eses.config.js',
}