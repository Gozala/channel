"use strict";

var Promise = require('es6-promise').Promise
var FixedBuffer = require("./buffer").FixedBuffer

// Private symbols are no yet present in the language but
// we emulate them via this strings.
var $closed = "@@channel/closed"
var $buffer = "@@channel/buffer"
var $puts = "@@channel/pending-puts"
var $takes = "@@channel/pending-takes"
var $in = "@@channel/in"
var $out = "@@channel/out"
var $race = "@@channel/race"
var $value = "@@atom/value"

var MAX_QUEUE_SIZE = Infinity // 1024

// This is a simple class for representing shared
// mutable state, mainly useful for primitive values.
function Atom(value) {
  this[$value] = value
}
Atom.prototype.Atom = Atom
Atom.prototype.reset = function(value) {
  this[$value] = value
}
Atom.prototype.valueOf = function() {
  return this[$value]
}

var $resolve = "@@task/resolve"
var $init = "@@task/init"
var $promise = "@@task/promise"
var $result = "@@task/result"
var $isActive = "@@task/active?"
var $complete = "@@task/complete"

// This is repreestantion of the pending (or complete)
// taks. Channels use instances of a subclasses like `Put`
// or `Take` to reperesent queued tasks on the channel.
// Operation can be given an `race` that is instance of `Atom`,
// if `race.valueOf()` is `false` when it comes to completion
// this task will be complete, otherwise it's going to
// be dropped. If `race` isn't provided then task is never
// dropped. Once this task is complete it's gonig to reset
// it's race to truthy, which mainly used to share `race`
// when racing multiple tasks where only one should be complete.
function Operation(race) {
  this[$race] = race || false
  Promise.call(this, this[$init].bind(this))
}
Operation.prototype = Object.create(Promise.prototype)
Operation.prototype.constructor = Operation
// just an alias so that subtypes could use `this.Operation`
// instead of applying to the constructor.
Operation.prototype.Operation = Operation
Operation.prototype.valueOf = function() {
  if (this.isPending())
    throw new Error("Can not dereference result of pending operation")

  return this[$result]
}
Operation.prototype[$init] = function(resolve, _) {
  this[$resolve] = resolve
}
// If task is pending method returns `false` if task task was complete,
// which means this task won the race.
Operation.prototype.isPending = function() {
  // When task is resolved race is updated to the winner, if
  // this task has no race or if it's not a winner of this race
  // task is considered pending.
  return this[$race] !== this &&
         this[$race].valueOf() !== this
}
// Operation is active if this and all other tasks sharing same race are
// pending.
Operation.prototype[$isActive] = function() {
  return !this[$race].valueOf()
}
// Completes pending task, by reseting shared `timout` to `true`
// and by fullfilling promise representing completion of this
// task.
Operation.prototype[$complete] = function(value) {
  if (this[$race])
    this[$race].reset(this)
  else
    this[$race] = this

  // If promise was allocated resolve it, otherwise just skip this
  // step.
  if (this[$resolve])
    this[$resolve](value)

  this[$result] = value
}


// Take is just a specialized `Operation` used to represent
// pending takes from the channel.
function Take(race) {
  this.Operation(race)
}
Take.prototype = Object.create(Operation.prototype)
Take.prototype.constructor = Take
Take.prototype.Take = Take


// Put is just a specialized `Operation` used to represent
// pending puts onto the channel. Additionally it has
// `value` field representing `value` it tries to put.
function Put(value, race) {
  this.value = value
  this.Operation(race)
}
Put.prototype = Object.create(Operation.prototype)
Put.prototype.constructor = Put
Put.prototype.Put = Put

function dequeue(queue) {
  while (queue.length) {
    var operation = queue.pop()
    if (operation[$isActive]())
      return operation
  }
}

function enqueue(queue, operation) {
  if (queue.length >=  MAX_QUEUE_SIZE) {
    throw new Error("No more than " + MAX_QUEUE_SIZE +
                    " pending operations are allowed on a single channel.")
  } else {
    queue.unshift(operation)
  }
}

function take(port, race) {
  if (!(port instanceof InputPort))
    throw TypeError("Can only take from input port")

  var buffer = port[$buffer]
  var puts = port[$puts]
  var takes = port[$takes]
  var closed = port[$closed]
  var take = new Take(race)

  if (take[$isActive]()) {
    // If there is buffered values take first one that
    // was put.
    if (buffer) {
      if (!buffer.isEmpty()) {
        take[$complete](buffer.take())
        var put = void(0)
        while (!buffer.isFull() && (put = dequeue(puts))) {
          put[$complete](true)
          buffer.put(put.value)
        }
      } else if (closed.valueOf()) {
        take[$complete](void(0))
      } else {
        enqueue(takes, take)
      }
    } else {
      var put = dequeue(puts)
      if (put) {
        put[$complete](true)
        take[$complete](put.value)
      } else if (closed.valueOf()) {
        take[$complete](void(0))
      } else {
        enqueue(takes, take)
      }
    }
  }
  return take
}


function put(port, value, race) {
  if (!(port instanceof OutputPort))
    throw TypeError("Can only put onto output port")

  var buffer = port[$buffer]
  var puts = port[$puts]
  var takes = port[$takes]
  var closed = port[$closed]
  var put = new Put(value, race)

  if (put[$isActive]()) {
    // If channel is already closed then
    // void resulting promise.
    if (closed.valueOf()) {
      put[$complete](void(0))
    }
    // If value is `undefined` such puts are
    // just dropped.
    else if (value === void(0)) {
      put[$complete](true)
    }
    else {
      // If it's a unbuffered channel
      if (buffer === void(0)) {
        // Dequeue active take. If such take exists complete
        // both put & take operations.
        var take = dequeue(takes)
        if (take) {
          put[$complete](true)
          take[$complete](value)
        }
        // If no active take is in a queue then enqueue put.
        else {
          enqueue(puts, put)
        }
      }
      // If channel is bufferred.
      else {
        // If buffer is full enqueu put operation.
        if (buffer.isFull()) {
          enqueue(puts, put)
        }
        // If buffer isn't full put value into a buffer and
        // complete a put operation.
        else {
          buffer.put(value)
          put[$complete](true)

          // If buffer is no longer empty (note that some
          // buffers may remain empty until certain amount
          // of data is bufferred), dequeu active take and
          // complete it with value taken from buffer.
          if (!buffer.isEmpty()) {
            var take = dequeue(takes)
            if (take) {
              take[$complete](buffer.take())
            }
          }
        }
      }
    }
  }
  return put
}


// Port is the interface that both input and output
// ends of the channel implement, they share same
// buffer put & take queues and a closed state,
// which are provided at the instantiation.
function Port(buffer, puts, takes, closed) {
  this[$buffer] = buffer
  this[$puts] = puts
  this[$takes] = takes
  this[$closed] = closed
}
Port.prototype.Port = Port
// When either (input / output) port is closed
// all of the pending takes on the channel are
// completed with `undefined`. Shared closed
// state is also reset to `true` to reflect
// it on both ends of the channel.
Port.prototype.close = function() {
  var closed = this[$closed]
  var takes = this[$takes]

  if (!closed.valueOf()) {
    closed.reset(true)
    // Void all queued takes.
    while (takes.length > 0) {
      var take = takes.pop()
      if (take[$isActive]())
        take[$complete](void(0))
    }
  }
}
exports.Port = Port

// InputPort is input endpoint of the channel that
// can be used to take values out of the channel.
function InputPort(buffer, puts, takes, closed) {
  this.Port(buffer, puts, takes, closed)
}
InputPort.prototype = Object.create(Port.prototype)
InputPort.prototype.constructor = InputPort
InputPort.prototype.InputPort = InputPort
InputPort.prototype.take = function() {
  return take(this, void(0))
}
exports.InputPort = InputPort


// `OutputPort` is an output endpoint of the channel
// that can be used to put values onto channel.
function OutputPort(buffer, puts, takes, closed) {
  this.Port(buffer, puts, takes, closed)
}
OutputPort.prototype = Object.create(Port.prototype)
OutputPort.prototype.constructor = OutputPort
OutputPort.prototype.OutputPort = OutputPort
OutputPort.prototype.put = function(value) {
  return put(this, value, void(0))
}
exports.OutputPort = OutputPort


function Channel(buffer) {
  buffer = buffer === void(0) ? buffer :
           buffer <= 0 ? void(0) :
           typeof(buffer) === "number" ? new FixedBuffer(buffer) :
           buffer;

  var puts = [], takes = [], closed = new Atom(false)

  this[$in] = new InputPort(buffer, takes, puts, closed)
  this[$out] = new OutputPort(buffer, takes, puts, closed)
}
Channel.prototype = {
  constructor: Channel,
  Channel: Channel,
  get input() { return this[$in] },
  get output() { return this[$out] }
}
exports.Channel = Channel


// Select allows to make a single choice between several channel
// operations (put / take). Choice is made is made in favor of operation
// that completes first. If more than one operation is ready to be complete
// at the same time choice is made in favor of the operation which was
// requested first.
// Usage:
//
// var select = new Select()
// var a = select.take(input1).then(function(x) {
//   console.log("Took " + x + " from input1")
// })
// var b = select.take(input2).then(function(x) {
//   console.log("Took " + x + " from input2")
// })
// var c = select.put(output, x).then(function(_) {
//   console.log("Put " + x + " onto output")
// })
//
// Note that only one of the above three operations is
// going to succeed.
function Select() {
  this[$race] = new Atom(false)
}
Select.prototype.Select = Select
Select.prototype.put = function(port, value) {
  return put(port, value, this[$race])
}
Select.prototype.take = function(port) {
  return take(port, this[$race])
}
exports.Select = Select
