"use strict";

var test = require("./test")
var Channel = require("../index").Channel
var Port = require("../index").Port
var InputPort = require("../index").InputPort
var OutputPort = require("../index").OutputPort
var Select = require("../index").Select
var Promise = require("es6-promise").Promise
var FixedBuffer = require("../index").FixedBuffer



test("take from closed output port results to void", function(test) {
  var c = new Channel(), output = c.output, input = c.input
  output.close()

  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))

  test.end()
})

test("take from closed input port results to void", function(test) {
  var c = new Channel(), input = c.input, output = c.output
  input.close()

  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))

  test.end()
})

test("put onto closed output port return to void", function(test) {
  var c = new Channel(), input = c.input, output = c.output
  output.close()

  test.isComplete(output.put(1), void(0))
  test.isComplete(output.put(2), void(0))
  test.isComplete(output.put(3), void(0))
  test.isComplete(output.put(4), void(0))
  test.isComplete(output.put(5), void(0))

  test.end()
})

test("put onto closed input port return to void", function(test) {
  var c = new Channel(), input = c.input, output = c.output
  input.close()

  test.isComplete(output.put(1), void(0))
  test.isComplete(output.put(2), void(0))
  test.isComplete(output.put(3), void(0))
  test.isComplete(output.put(4), void(0))
  test.isComplete(output.put(5), void(0))

  test.end()
})


test("pending takes resolve to void", function(test) {
  var c = new Channel(), input = c.input, output = c.output

  test.isPending(input.take(), void(0))
  test.isPending(input.take(), void(0))
  test.isPending(input.take(), void(0))
  test.isPending(input.take(), void(0))
  test.isPending(input.take(), void(0))

  input.close()

  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))


  test.end()
})

test("pending puts still can be taken", function(test) {
  var c = new Channel(), input = c.input, output = c.output

  test.isPending(output.put(1), true)
  test.isPending(output.put(2), true)
  test.isPending(output.put(3), true)

  input.close()

  test.isComplete(output.put(4), void(0))
  test.isComplete(output.put(5), void(0))

  test.isComplete(input.take(), 1)
  test.isComplete(input.take(), 2)
  test.isComplete(input.take(), 3)
  test.isComplete(input.take(), void(0))
  test.isComplete(input.take(), void(0))

  test.end()
})
