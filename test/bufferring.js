"use strict";

var test = require("./test")
var Channel = require("../index").Channel
var Port = require("../index").Port
var InputPort = require("../index").InputPort
var OutputPort = require("../index").OutputPort
var Select = require("../index").Select
var Promise = require("es6-promise").Promise
var FixedBuffer = require("../index").FixedBuffer

test("unbufferred channels block", function(test) {
  var c = new Channel(), input = c.input, output = c.output

  test.isPending(output.put(1), true)
  test.isComplete(input.take(), 1)
  test.isPending(input.take(), 2)
  test.isComplete(output.put(2), true)

  test.end()
})


test("bufferred channels", function(test) {
  var channel = new Channel(3), input = channel.input, output = channel.output

  test.isComplete(output.put(1), true)
  test.isComplete(output.put(2), true)
  test.isComplete(output.put(3), true)
  test.isPending(output.put(4), true)
  test.isPending(output.put(5), true)
  test.isComplete(input.take(), 1)
  test.isComplete(input.take(), 2)
  test.isComplete(input.take(), 3)
  test.isComplete(input.take(), 4)
  test.isComplete(input.take(), 5)
  test.isPending(input.take(), 6)
  test.isPending(input.take(), 7)
  test.isComplete(output.put(6), true)
  test.isComplete(output.put(7), true)

  test.end()
})


test("channels with custom buffering", function(test) {
  function Aggregate(size) {
    FixedBuffer.call(this, size)
    this.buffer = []
  }
  Aggregate.prototype = Object.create(FixedBuffer.prototype)
  Aggregate.prototype.isEmpty = function() {
    return this.buffer.length === 0
  }
  Aggregate.prototype.isFull = function() {
    return this.buffer.length === this.size
  }
  Aggregate.prototype.put = function(chunk) {
    this.buffer.push(chunk)
  }
  Aggregate.prototype.take = function() {
    return this.buffer.splice(0)
  }

  var buffer = new Aggregate(3)
  var c = new Channel(buffer), input = c.input, output = c.output

  test.isPending(input.take(), [1])
  test.isPending(input.take(), [2])

  test.isComplete(output.put(1), true)
  test.equal(buffer.isEmpty(), true, "buffer is empty")
  test.equal(buffer.isFull(), false, "buffer isn't full")

  test.isComplete(output.put(2), true)
  test.equal(buffer.isEmpty(), true, "buffer is empty")
  test.equal(buffer.isFull(), false, "buffer isn't full")

  test.isComplete(output.put(3), true)
  test.equal(buffer.isEmpty(), false, "put was bufferred")
  test.equal(buffer.isFull(), false, "buffer isn't full")
  test.deepEqual(buffer.buffer, [3], "put was bufferred")

  test.isComplete(output.put(4), true)
  test.equal(buffer.isEmpty(), false, "put was bufferred")
  test.equal(buffer.isFull(), false, "buffer isn't full")
  test.deepEqual(buffer.buffer, [3, 4], "put was bufferred")

  test.isComplete(output.put(5), true)
  test.equal(buffer.isEmpty(), false, "put was bufferred")
  test.equal(buffer.isFull(), true, "buffer is full")
  test.deepEqual(buffer.buffer, [3, 4, 5], "put was bufferred")

  test.isPending(output.put(6), true)
  test.equal(buffer.isEmpty(), false, "put was bufferred")
  test.equal(buffer.isFull(), true, "buffer is full")
  test.deepEqual(buffer.buffer, [3, 4, 5], "put was queued")

  test.isComplete(input.take(), [3, 4, 5])
  test.equal(buffer.isEmpty(), false, "queued put was bufferred")
  test.equal(buffer.isFull(), false, "buffer was drained")
  test.deepEqual(buffer.buffer, [6], "queued put was moved to buffer")

  test.isComplete(input.take(), [6])
  test.equal(buffer.isEmpty(), true, "buffer is empty")
  test.equal(buffer.isFull(), false, "buffer was drained")
  test.deepEqual(buffer.buffer, [], "buffer is empty")

  test.end()
})
