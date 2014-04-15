"use strict";

var test = require("tape")
var Channel = require("../index").Channel
var Port = require("../index").Port
var InputPort = require("../index").InputPort
var OutputPort = require("../index").OutputPort
var Select = require("../index").Select
var Promise = require('es6-promise').Promise

test("Channel API", function(test) {
  test.equal(typeof(Channel), "function", "Channel is a function")

  var ch = new Channel()
  test.equal(typeof(ch), "object", "instantiated channel")
  test.ok(ch instanceof Channel, "is a channel instance")
  test.ok(ch.input instanceof Port, ".input is a Port")
  test.ok(ch.input instanceof InputPort, ".input is an InputPort")
  test.ok(ch.output instanceof Port, ".output is a Port")
  test.ok(ch.output instanceof OutputPort, ".output is a OutputPort")
  test.end()
})

function testTake(test, take) {
  test.equal(typeof(take), "object", ".take() returns an object")
  test.ok(take instanceof Promise, ".take() returns a promise")
  test.notEqual(Object.getPrototypeOf(take), Promise.prototype,
                ".take() is derived from promise")
  test.equal(typeof(take.isPending), "function", ".take() has .isPending method")
  test.equal(typeof(take.isPending()), "boolean", ".take().isPending() is boolean")
  test.equal(typeof(take.then), "function", ".take() has .then method")
}

test("InputPort API", function(test) {
  var unbufferred = new Channel()
  var bufferred = new Channel(3)

  test.equal(typeof(unbufferred.input.take),
             "function", "has .take method")
  testTake(test, unbufferred.input.take())

  test.equal(typeof(bufferred.input.take),
             "function", "has .take method")
  testTake(test, bufferred.input.take())

  test.throws(function() {
    InputPort.prototype.put.call(unbufferred.input, 3)
  }, "Can only put onto output port", "can't put onto input")


  test.equal(unbufferred.input.close(), void(0), "close returns void")
  test.equal(bufferred.input.close(), void(0), "close returns void")

  test.end()
})

function testPut(test, put) {
  test.equal(typeof(put), "object", ".put() returns an object")
  test.ok(put instanceof Promise, ".put() returns a promise")
  test.notEqual(Object.getPrototypeOf(put), Promise.prototype,
                ".put() is derived from promise")
  test.equal(typeof(put.isPending), "function", ".take() has .isPending method")
  test.equal(typeof(put.isPending()), "boolean", ".take().isPending() is boolean")
  test.equal(typeof(put.then), "function", ".take() has .then method")
}

test("OutputPort API", function(test) {
  var unbufferred = new Channel()
  var bufferred = new Channel(3)

  test.equal(typeof(unbufferred.output.put), "function", "has .put method")
  test.equal(typeof(bufferred.output.put), "function", "has .put method")
  testPut(test, unbufferred.output.put())
  testPut(test, bufferred.output.put())

  test.throws(function() {
    InputPort.prototype.take.call(unbufferred.output)
  }, "Can only take from input port", "can't take from output")

  test.equal(unbufferred.output.close(), void(0), ".close() returns void")
  test.equal(bufferred.output.close(), void(0), ".close() returns void")
  test.end()
})

test("Select API", function(test) {
  var select = new Select()
  var channel = new Channel()

  test.equal(typeof(select.put), "function", "has .put method")
  test.equal(typeof(select.take), "function", "has .take method")

  testTake(test, select.take(channel.input))
  testPut(test, select.put(channel.output))

  test.end()
})
