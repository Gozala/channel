"use strict";

var tape = require("tape")
var Promise = require("es6-promise").Promise

function assertOperation(isPending, value, test, operation) {
  test.equal(operation.isPending(), isPending,
             isPending ? "operation is pending" : "operation is complete")


  if (isPending) {
    test.throws(function() {
      operation.valueOf()
    }, "Can not dereference result of pending operation")
  } else {
    test.deepEqual(operation.valueOf(), value,
                   "operation dereferenced to result value")
  }


  return operation.then(function(result) {
    test.deepEqual(result, value, "resolves to " + value)
    test.equal(operation.isPending(), false, "operation is complete")
    test.deepEqual(operation.valueOf(), value, "operation is dereferenced to " + value)
  })
}

function withAsserts(source) {
  var asserts = []
  var test = Object.create(source)
  test.isPending = function(operation, value) {
    asserts.push(assertOperation(true, value, this, operation))
  }
  test.isComplete = function(operation, value) {
    asserts.push(assertOperation(false, value, this, operation))
  }
  test.end = function() {
    Promise.all(asserts).then(function() {
      source.end()
    })
  }

  return test
}

function test(description, unit) {
  return tape(description, function(test) {
    return unit(withAsserts(test))
  })
}
module.exports = test
