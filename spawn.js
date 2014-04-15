"use strict";

var gnode = require("gnode")

function spawn(routine) {
  return new Promise(function(resolve, reject) {
    var task = routine()
    var raise = function(error) {
      task.throw(error)
    }
    var next = function(data) {
      var step = task.next(data)
      if (step.done) {
        resolve(step.value)
      } else if (step.value.then) {
        if (step.value.isPending && !step.value.isPending())
          next(step.value.valueOf())
        else
          step.value.then(next, raise)
      } else {
        next(step.value)
      }
    }
    next()
  })
}
exports.spawn = spawn
