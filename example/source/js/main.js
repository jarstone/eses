import { getTransitionDuration } from './modules/_util'

function init() {
  console.log('hello world')
}
init()

console.log(getTransitionDuration(document.body))