const getTransitionDuration = element => {
  return parseFloat(window.getComputedStyle(element).transitionDuration) * 1000
}

export {
  getTransitionDuration,
}