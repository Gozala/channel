"use strict";

var test = require("tape")
var Channel = require("../index").Channel
var Port = require("../index").Port
var InputPort = require("../index").InputPort
var OutputPort = require("../index").OutputPort
var Select = require("../index").Select
var Promise = require('es6-promise').Promise

test("unbufferred channels block", function(test) {
  var ch = new Channel();

  var put = ch.output.put(1)

  test.equal(put.isPending(), true,
             "put on unbufferred channel blocks")

  test.throws(function() {
    put.valueOf()
  }, "Can not dereference result of pending operation")

  var isPutAsync = false
  var assert1 = put.then(function(value) {
    test.equal(value, true, "resolves to true after put is complete")
    test.ok(isPutAsync, "put promise is resolved async")
    test.equal(put.isPending(), false, "put is no longer pending")
    test.equal(put.valueOf(), true, "can dereference once put is complete")
  })
  isPutAsync = true

  var isTakeAsync = false
  var take = ch.input.take()
  test.equal(take.isPending(), false, "take doesn't block if put is pending")
  test.equal(take.valueOf(), 1, "takes value being put")
  var assert2 = take.then(function(value) {
    test.equal(value, 1, "take resolves to value taken")
    test.ok(isTakeAsync, "take promise is resolved async")
  })
  isTakeAsync = true

  var take2 = ch.input.take()
  test.equal(take2.isPending(), true, "take blocks if no put is pending")
  test.throws(function() {
    take2.valueOf()
  }, "Can not dereference result of pending operation")
  var isTake2Async = false
  var assert3 = take2.then(function(value) {
    test.equal(value, 2, "take resolves to next put value")
    test.equal(take2.isPending(), false, "take is no longer pending")
    test.equal(take2.valueOf(), 2, "can dereference take once it's complete")
    test.ok(isTake2Async, "take promise is resolved async")
  })
  isTake2Async = true

  var put2 = ch.output.put(2)
  test.equal(put2.isPending(), false, "put is complete if take was pending")
  test.equal(put2.valueOf(), true, "put result is true")
  var isPut2Async = false
  var assert4 = put2.then(function(value) {
    test.equal(value, true, "resolves to true after put is complete")
    test.ok(isPut2Async, "put promise is resolved async")
    test.equal(put2.isPending(), false, "put is no longer pending")
    test.equal(put2.valueOf(), true, "can dereference once put is complete")
  })
  isPut2Async = true

  Promise.all([assert1, assert2, assert3, assert4]).then(function() {
    test.end()
  })
})


function assertOperation(isPending, value, test, operation) {
  test.equal(operation.isPending(), isPending,
             isPending ? "operation is pending" : "operation is complete")


  if (isPending) {
    test.throws(function() {
      operation.valueOf()
    }, "Can not dereference result of pending operation")
  } else {
    test.equal(operation.valueOf(), value,
               "operation dereferenced to result value")
  }


  return operation.then(function(result) {
    test.equal(result, value, "resolves to " + value)
    test.equal(operation.isPending(), false, "operation is complete")
    test.equal(operation.valueOf(), value, "operation is dereferenced to " + value)
  })
}

var assertPendingPut = function(test, put) {
  return assertOperation(true, true, test, put)
}
var assertCompletePut = function(test, put) {
  return assertOperation(false, true, test, put)
}
var asserPendingTake = function(test, take, value) {
  return assertOperation(true, value, test, take)
}
var asserCompleteTake = function(test, take, value) {
  return assertOperation(false, value, test, take)
}

test("bufferred channels", function(test) {
  var c = new Channel(3)
  var tasks = []

  var p1 = c.output.put(1)
  tasks.push(assertCompletePut(test, p1))

  var p2 = c.output.put(2)
  tasks.push(assertCompletePut(test, p2))

  var p3 = c.output.put(3)
  tasks.push(assertCompletePut(test, p3))

  var p4 = c.output.put(4)
  tasks.push(assertPendingPut(test, p4))

  var p5 = c.output.put(5)
  tasks.push(assertPendingPut(test, p5))

  var t1 = c.input.take()
  tasks.push(asserCompleteTake(test, t1, 1))

  var t2 = c.input.take()
  tasks.push(asserCompleteTake(test, t2, 2))

  var t3 = c.input.take()
  tasks.push(asserCompleteTake(test, t3, 3))

  var t4 = c.input.take()
  tasks.push(asserCompleteTake(test, t4, 4))

  var t5 = c.input.take()
  tasks.push(asserCompleteTake(test, t5, 5))

  var t6 = c.input.take()
  tasks.push(asserPendingTake(test, t6, 6))

  var t7 = c.input.take()
  tasks.push(asserPendingTake(test, t7, 7))

  var p6 = c.output.put(6)
  tasks.push(assertCompletePut(test, p6))

  var p7 = c.output.put(7)
  tasks.push(assertCompletePut(test, p7))

  Promise.all(tasks).then(function() { test.end() })
})
