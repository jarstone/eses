#!/usr/bin/env node

const fs = require('fs')
const ejs = require('ejs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const sass = require('sass')
const merge = require('lodash.merge')
const globby = require('globby')
const server = require('slive-server')
const esbuild = require('esbuild')
const postcss = require('postcss')
const chokidar = require('chokidar')
const beautify = require('js-beautify').html
const condense = require('condense-newlines')
const autoprefixer = require('autoprefixer')
const { parseHTML } = require('linkedom')
const { resolve, extname, basename, join, parse, posix } = require('path')
require('colors')

const systemConfig = require(join(__dirname, 'config.js'))
const customConfig = fs.existsSync(systemConfig.customConfig) ? require(resolve(systemConfig.customConfig)) : {}
const config = merge(systemConfig, customConfig)

const htmlSrc = config.path.html.src
const htmlDst = config.path.html.dst
const htmlData = join(htmlSrc, 'data.json')
const cssSrc = config.path.css.src
const cssDst = config.path.css.dst
const jsSrc = config.path.js.src
const jsDst = config.path.js.dst
const delay = 200


fs.existsSync(cssDst) === false && fs.mkdirSync(cssDst, { recursive: true })
fs.existsSync(htmlDst) === false && fs.mkdirSync(htmlDst, { recursive: true })


function files(dir, ext) {
  return fs.readdirSync(dir, 'utf-8')
    .filter(i => extname(i) === '.' + ext && i.startsWith('_') === false)
}
function doneIn(start) {
  console.log('Done in'.blue, new Date() - start, 'ms\n')
}
function argv(key) {
  const arg = process.argv.filter(val => val.startsWith('--' + key))
  return arg.length ? arg.pop().split('=').pop() : null
}
function toMin(src) {
  const obj = parse(src)
  return join(obj.dir, obj.name + '.min' + obj.ext)
}
function toExt(src, ext) {
  const obj = parse(src)
  return join(obj.dir, obj.name + ext)
}
async function copy(src, dst) {
  return await new Promise(resolve => {
    fs.copyFile(src, dst, resolve)
  })
}
async function emptyDir(dir) {
  fs.existsSync(dir) === false && fs.mkdirSync(dir, { recursive: true })
  return await new Promise(resolve => {
    fs.readdirSync(dir, 'utf-8').forEach(file => fs.unlinkSync(join(dir, file)))
    resolve()
  })
}


async function html(file, elapsed = true) {
  return await new Promise(async resolve => {
    const src = join(htmlSrc, file)
    const dst = join(htmlDst, toExt(file, '.html'))

    console.log('Compiling'.gray, src.cyan, 'to', dst.cyan)

    const start = elapsed ? new Date() : 0
    const result = await ejs.renderFile(src, JSON.parse(fs.readFileSync(htmlData, 'utf-8')))

    fs.writeFileSync(dst, result)

    elapsed && doneIn(start)
    resolve()
  })
}
async function htmlAll() {
  await emptyDir(htmlDst)

  const start = new Date()
  await Promise.all(files(htmlSrc, 'ejs').map(file => html(file, false)))
  doneIn(start)
}
async function htmlPartial(target) {
  return await new Promise(async resolve => {
    const start = new Date()
    const partial = parse(target).name
    let targets = []
    files(htmlSrc, 'ejs').forEach(file => {
      let content = fs.readFileSync(join(htmlSrc, file), 'utf-8')
        .match(/include\(\s*(['"])(.+?)\1\s*(,\s*({.+?})\s*)?\)/g)
      content = content ? content.join('') : ''

      if (content.includes(partial + "'") || content.includes(partial + '"')) {
        targets.push(file)
      }
    })
    await Promise.all(targets.map(file => html(file, false)))
    doneIn(start)
    resolve()
  })
}
async function htmlBeautify(file) {
  return await new Promise(async resolve => {
    const src = join(htmlDst, file)
    fs.writeFileSync(src, beautify(condense(fs.readFileSync(src, 'utf-8')), {
      indent_size: 2,
      unformatted: ['pre', 'code'],
    }))
    resolve()
  })
}
async function htmlBeautifyAll() {
  console.log('Beautifying'.gray, join(htmlDst, '*.html').cyan)

  const start = new Date()
  await Promise.all(files(htmlDst, 'html').map(htmlBeautify))
  doneIn(start)
}


async function css(file, elapsed = true) {
  return await new Promise(async resolve => {
    const src = join(cssSrc, file)
    const dst = join(cssDst, toExt(file, '.css'))

    console.log('Compiling'.gray, src.cyan, 'to', dst.cyan)

    const start = elapsed ? new Date() : 0
    if (config.useDartSass) {
      await toggleSassJs(false)
      await exec(`sass --source-map --embed-sources ${src} ${dst}`).catch(err => console.log(err.stderr))
    }
    else {
      await toggleSassJs(true)
      const result = sass.renderSync({
        file: src,
        sourceMap: true,
        outFile: dst,
      })

      fs.writeFileSync(dst, result.css)
      fs.writeFileSync(dst + '.map', result.map)
    }

    elapsed && doneIn(start)
    resolve()
  })
}
async function cssAll() {
  await emptyDir(cssDst)

  const start = new Date()
  await Promise.all(files(cssSrc, 'scss').map(file => css(file, false)))
  doneIn(start)
}
async function cssPartial(target) {
  return await new Promise(async resolve => {
    const start = new Date()
    const partial = parse(target).name.substring(1)

    let targets = []
    files(cssSrc, 'scss').forEach(file => {
      const content = fs.readFileSync(join(cssSrc, file), 'utf-8')
        .split('\n').filter(i => i.startsWith('@import')).join('')

      if (content.includes(partial + "'") || content.includes(partial + '"')) {
        targets.push(file)
      }
    })
    await Promise.all(targets.map(file => css(file, false)))
    doneIn(start)
    resolve()
  })
}
async function cssAutoprefix(file, fromCssDst = true) {
  return await new Promise(async resolve => {
    const src = fromCssDst ? join(cssDst, file) : file
    const content = fs.readFileSync(src, 'utf-8')

    const result = await postcss([autoprefixer]).process(content, {
      from: file,
      map: {
        inline: false,
        annotation: true,
        sourcesContent: true,
      }
    })
    fs.writeFileSync(src, result.css)
    resolve()
  })
}
async function cssMinify(file, fromCssDst = true) {
  return await new Promise(async resolve => {
    const src = fromCssDst ? join(cssDst, file) : file
    const dst = fromCssDst ? join(cssDst, toMin(file)) : toMin(file)
    const content = fs.readFileSync(src, 'utf-8')

    const result = esbuild.transformSync(content, {
      loader: 'css',
      minify: true,
    })
    fs.writeFileSync(dst, result.code)

    resolve()
  })
}
async function cssAutoprefixMinify() {
  console.log('Autoprefixing & Minifying'.gray, join(cssDst, '*.css').cyan)

  const start = new Date()
  const cssFiles = files(cssDst, 'css').filter(i => i.slice(i.length - 8) !== '.min.css')
  await Promise.all(cssFiles.map(file => cssAutoprefix(file)))
  await Promise.all(cssFiles.map(file => cssMinify(file)))
  doneIn(start)
}


async function js(file, elapsed = true) {
  return await new Promise(async resolve => {
    const src = join(jsSrc, file)
    const dst = join(jsDst, file)

    console.log('Compiling'.gray, src.cyan, 'to', dst.cyan)

    const start = elapsed ? new Date() : 0
    esbuild.buildSync({
      entryPoints: [src],
      bundle: true,
      sourcemap: true,
      outfile: dst,
    })

    elapsed && doneIn(start)
    resolve()
  })
}
async function jsAll() {
  await emptyDir(jsDst)

  const start = new Date()
  await Promise.all(files(jsSrc, 'js').map(file => js(file, false)))
  doneIn(start)
}
async function jsPartial(target) {
  return await new Promise(async resolve => {
    const start = new Date()
    const partial = parse(target).name

    let targets = []
    files(jsSrc, 'js').forEach(file => {
      const content = fs.readFileSync(join(jsSrc, file), 'utf-8')
        .split('\n').filter(i => i.startsWith('import ')).join('')

      if (content.includes(partial + "'") || content.includes(partial + '"')) {
        targets.push(file)
      }
    })
    await Promise.all(targets.map(file => js(file, false)))
    doneIn(start)
    resolve()
  })
}
async function jsMinify(file, fromJsDst = true) {
  return await new Promise(async resolve => {
    const src = fromJsDst ? join(jsDst, file) : file
    const dst = toMin(src)

    esbuild.buildSync({
      entryPoints: [src],
      outfile: dst,
      minify: true,
    })

    resolve()
  })
}
async function jsMinifyAll() {
  fs.existsSync(jsDst) === false && fs.mkdirSync(jsDst)
  console.log('Minifying'.gray,join(jsDst, '*.js').cyan)

  const start = new Date()
  const jsFiles = files(jsDst, 'js').filter(i => i.slice(i.length - 7) !== '.min.js')
  await Promise.all(jsFiles.map(file => jsMinify(file)))
  doneIn(start)
}


async function setNonMinifiedAttribute(el, attr) {
  return await new Promise(resolve => {
    const src = el.getAttribute(attr)
    switch (attr) {
      case 'href':
        src.endsWith('.min.css') && el.setAttribute(attr, src.slice(0, -7) + 'css')
        break;
      case 'src':
        src.endsWith('.min.js') && el.setAttribute(attr, src.slice(0, -6) + 'js')
        break;
    }
    resolve()
  })
}
async function setMinifiedAttribute(el, attr) {
  return await new Promise(async resolve => {
    await setNonMinifiedAttribute(el, attr)
    const src = el.getAttribute(attr)
    switch (attr) {
      case 'href':
        src.endsWith('.css') && el.setAttribute(attr, src.slice(0, -3) + 'min.css')
        break;
      case 'src':
        src.endsWith('.js') && el.setAttribute(attr, src.slice(0, -2) + 'min.js')
        break;
    }
    resolve()
  })
}
async function setAsset(file, minified = true) {
  return await new Promise(async resolve => {
    const src = join(htmlDst, file)
    const { document } = parseHTML(fs.readFileSync(src, 'utf-8'))

    await Promise.all(
      document.querySelectorAll('link[href]')
        .map(el => minified ? setMinifiedAttribute(el, 'href') : setNonMinifiedAttribute(el, 'href'))
    )
    await Promise.all(
      document.querySelectorAll('script[src]')
        .map(el => minified ? setMinifiedAttribute(el, 'src') : setNonMinifiedAttribute(el, 'src'))
    )

    fs.writeFileSync(src, '<!DOCTYPE html>\n' + document.documentElement.outerHTML)
    resolve()
  })
}
async function setAssetAll(minified = true) {
  console.log('Adjusting assets'.gray, join(htmlDst, '*.html').cyan)

  const start = new Date()
  await Promise.all(files(htmlDst, 'html').map(file => setAsset(file, minified)))
  doneIn(start)
}


async function lib() {
  const lib = require(resolve('eses.libraries.js'))
  fs.rmdirSync(lib.dst, { recursive: true })

  console.log('Copying libraries to'.gray, join(lib.dst).cyan)
  await libCopy(lib.lib, lib.dst)

  console.log('Autoprefixing css files from'.gray, join(lib.dst).cyan)
  await libAutoprefixCss(lib.dst)

  console.log('Minifying css files from'.gray, join(lib.dst).cyan)
  await libMinifyCss(lib.dst)

  console.log('Minifying js files from'.gray, join(lib.dst).cyan)
  await libMinifyJs(lib.dst)
}
async function libCopy(libs, dst) {
  return await new Promise(async resolve => {
    for (const [key, value] of Object.entries(libs)) {
      const dstDir = join(dst, key)
      fs.existsSync(dstDir) === false && fs.mkdirSync(dstDir, { recursive: true })

      const files = await globby(value)
      await Promise.all(files.map(file => copy(join(file), join(dstDir, basename(file)))))
    }
    resolve()
  })
}
async function libAutoprefixCss(dst) {
  return await new Promise(async resolve => {
    const files = await globby(posix.join(dst, '**', '*.css'))
    await Promise.all(files.map(file => cssAutoprefix(file, false)))
    resolve()
  })
}
async function libMinifyCss(dst) {
  return await new Promise(async resolve => {
    const files = await globby([posix.join(dst, '**', '*.css'), posix.join('!' + dst, '**', '*.min.css')])
    await Promise.all(files.map(file => cssMinify(file, false)))
    resolve()
  })
}
async function libMinifyJs(dst) {
  return await new Promise(async resolve => {
    const files = await globby([posix.join(dst, '**', '*.js'), posix.join('!' + dst, '**', '*.min.js')])
    await Promise.all(files.map(file => jsMinify(file, false)))
    resolve()
  })
}


async function toggleSassJs(enable) {
  return await new Promise(resolve => {
    const bin = join('node_modules', '.bin')
    const sassBin = join(bin, 'sass')
    const sassCmd = join(bin, 'sass.cmd')
    const _sassBin = join(bin, '_sass')
    const _sassCmd = join(bin, '_sass.cmd')

    if (enable) {
      fs.existsSync(_sassBin) && fs.renameSync(_sassBin, sassBin)
      fs.existsSync(_sassCmd) && fs.renameSync(_sassCmd, sassCmd)
    }
    else {
      fs.existsSync(sassBin) && fs.renameSync(sassBin, _sassBin)
      fs.existsSync(sassCmd) && fs.renameSync(sassCmd, _sassCmd)
    }
    resolve()
  })
}


void (async () => {

  if (argv('dev')) {
    await setAssetAll(false)
    chokidar.watch(htmlSrc, { ignoreInitial: true }).on('all', (event, target) => {
      setTimeout(async () => {
        if ((event === 'add' || event === 'change') && target !== htmlData) {
          const filename = basename(target)
          filename.startsWith('_') ? await htmlPartial(filename) : await html(filename)
        }
        else {
          await htmlAll()
        }
      }, delay)
    })
    chokidar.watch(cssSrc, { ignoreInitial: true }).on('all', (event, target) => {
      setTimeout(async () => {
        if (event === 'add' || event === 'change') {
          const filename = basename(target)
          filename.startsWith('_') ? await cssPartial(filename) : await css(filename)
        }
        else {
          await cssAll()
        }
      }, delay)
    })
    chokidar.watch(jsSrc, { ignoreInitial: true }).on('all', (event, target) => {
      setTimeout(async () => {
        if (event === 'add' || event === 'change') {
          const filename = basename(target)
          filename.startsWith('_') ? await jsPartial(filename) : await js(filename)
        }
        else {
          await jsAll()
        }
      }, delay)
    })
    server.start(config.server)
    console.log('Ready for changes\n'.blue)
  }
  else if (argv('lib')) {
    const start = new Date()
    await lib()
    doneIn(start)
  }
  else {
    const start = new Date()

    await htmlAll()
    await htmlBeautifyAll()
    await setAssetAll()
    await cssAll()
    await cssAutoprefixMinify()
    await jsAll()
    await jsMinifyAll()

    console.log('Build finished in'.green, new Date() - start, 'ms\n')
  }

})()