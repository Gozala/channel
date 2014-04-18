"use strict";

var Promise = require('es6-promise').Promise
var FixedBuffer = require("./buffer").FixedBuffer

// Private symbols are no yet present in the language but
// we emulate them via this strings.
var $channel = "@@port/channel"
var $closed = "@@channel/closed"
var $buffer = "@@channel/buffer"
var $puts = "@@channel/pending-puts"
var $takes = "@@channel/pending-takes"
var $in = "@@channel/in"
var $out = "@@channel/out"
var $select = "@@channel/select"
var $value = "@@operation/value"
var $resolve = "@@operation/resolve"
var $init = "@@operation/init"
var $result = "@@operation/result"
var $isActive = "@@operation/active?"
var $complete = "@@operation/complete"
var $choice = "@@select/choice"

var MAX_QUEUE_SIZE = Infinity // 1024



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
function Operation(select) {
  this[$select] = select || this
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
// If operation is pending method returns `false`, which is the case
// unless associated selecet has a choice set to this.
Operation.prototype.isPending = function() {
  // When task is resolved race is updated to the winner, if
  // this task has no race or if it's not a winner of this race
  // task is considered pending.
  return this[$select][$choice] !== this
}
// Operation is active if select associated with it does not has a
// choice set yet.
Operation.prototype[$isActive] = function() {
  return this[$select][$choice] == void(0)
}
// Completes pending task, by reseting shared `timout` to `true`
// and by fullfilling promise representing completion of this
// task.
Operation.prototype[$complete] = function(result) {
  if (!this[$isActive]())
    throw Error("Can't complete inactive operation")

  this[$select][$choice] = this
  this[$result] = result
  this[$resolve](result)
}


// Takes operation queue in form of array and pops operations
// until first active one is discovered, which is returned back.
// If no active operation is discovered then return is void.
function dequeue(queue) {
  while (queue.length) {
    var operation = queue.pop()
    if (operation[$isActive]())
      return operation
  }
}

// Takes operation queue in form of array and adds passed operation
// into a queue. If queue reached MAX_QUEUE_SIZE exception is thrown.
function enqueue(queue, operation) {
  if (queue.length >=  MAX_QUEUE_SIZE) {
    throw new Error("No more than " + MAX_QUEUE_SIZE +
                    " pending operations are allowed on a single channel.")
  } else {
    queue.unshift(operation)
  }
}

function close(port) {
  var channel = port[$channel]
  var takes = channel[$takes]

  if (!channel[$closed]) {
    channel[$closed] = true
    // Void all queued takes.
    while (takes.length > 0) {
      var take = takes.pop()
      if (take[$isActive]())
        take[$complete](void(0))
    }
  }
}

function take(port, select) {
  if (!(port instanceof InputPort))
    throw TypeError("Can only take from input port")

  var channel = port[$channel]
  var buffer = channel[$buffer]
  var puts = channel[$puts]
  var takes = channel[$takes]
  var take = new Operation(select)

  if (take[$isActive]()) {
    // If there is buffered values take first one that
    // was put.
    if (buffer) {
      if (!buffer.isEmpty()) {
        take[$complete](buffer.take())
        var put = void(0)
        while (!buffer.isFull() && (put = dequeue(puts))) {
          put[$complete](true)
          buffer.put(put[$value])
        }
      } else if (channel[$closed]) {
        take[$complete](void(0))
      } else {
        enqueue(takes, take)
      }
    } else {
      var put = dequeue(puts)
      if (put) {
        put[$complete](true)
        take[$complete](put[$value])
      } else if (channel[$closed]) {
        take[$complete](void(0))
      } else {
        enqueue(takes, take)
      }
    }
  }
  return take
}


function put(port, value, select) {
  if (!(port instanceof OutputPort))
    throw TypeError("Can only put onto output port")

  var channel = port[$channel]
  var buffer = channel[$buffer]
  var puts = channel[$puts]
  var takes = channel[$takes]
  var put = new Operation(select)

  if (put[$isActive]()) {
    // If channel is already closed then
    // void resulting promise.
    if (channel[$closed]) {
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
          put[$value] = value
          enqueue(puts, put)
        }
      }
      // If channel is bufferred.
      else {
        // If buffer is full enqueu put operation.
        if (buffer.isFull()) {
          put[$value] = value
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
function Port(channel) {
  this[$channel] = channel
}
Port.prototype.Port = Port
// When either (input / output) port is closed
// all of the pending takes on the channel are
// completed with `undefined`. Shared closed
// state is also reset to `true` to reflect
// it on both ends of the channel.
Port.prototype.close = function() {
  return close(this)
}
exports.Port = Port

// InputPort is input endpoint of the channel that
// can be used to take values out of the channel.
function InputPort(channel) {
  this.Port(channel)
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
function OutputPort(channel) {
  this.Port(channel)
}
OutputPort.prototype = Object.create(Port.prototype)
OutputPort.prototype.constructor = OutputPort
OutputPort.prototype.OutputPort = OutputPort
OutputPort.prototype.put = function(value) {
  return put(this, value, void(0))
}
exports.OutputPort = OutputPort


function Channel(buffer) {
  this[$buffer] = buffer === void(0) ? buffer :
                  buffer <= 0 ? void(0) :
                  typeof(buffer) === "number" ? new FixedBuffer(buffer) :
                  buffer
  this[$puts] = []
  this[$takes] = []
  this[$closed] = false

  this[$in] = new InputPort(this)
  this[$out] = new OutputPort(this)
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
  this[$choice] = void(0)
}
Select.prototype.Select = Select
Select.prototype.put = function(port, value) {
  return put(port, value, this)
}
Select.prototype.take = function(port) {
  return take(port, this)
}
exports.Select = Select
