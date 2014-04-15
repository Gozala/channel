"use strict";


var $size = "@@channel/size"
var $buffer = "@@buffer/buffer"

function FixedBuffer(size) {
  this[$size] = size
  this[$buffer] = []
}
FixedBuffer.prototype = {
  constructor: FixedBuffer,
  get size() {
    return this[$size]
  },
  isEmpty: function() {
    return this[$buffer].length === 0
  },
  isFull: function() {
    return this[$buffer].length === this[$size]
  },
  put: function(item) {
    if (this.isFull())
      throw Error("Can't put to a full buffer")
    this[$buffer].unshift(item)
  },
  take: function(item) {
    if (this.isEmpty())
      throw Error("Can't take from empty buffer")
    return this[$buffer].pop()
  }
}
exports.FixedBuffer = FixedBuffer


function UnblockingBuffer(size) {
  FixedBuffer.call(this, size)
}
UnblockingBuffer.prototype = Object.create(FixedBuffer.prototype)
UnblockingBuffer.prototype.constructor = UnblockingBuffer
UnblockingBuffer.prototype.isFull = function() {
  return false;
}
UnblockingBuffer.prototype.put = function() {
  throw TypeError("Subclass must implement `put` method");
}
exports.UnblockingBuffer = UnblockingBuffer

function SlidingBuffer(size) {
  UnblockingBuffer.call(this, size)
}
SlidingBuffer.prototype = Object.create(UnblockingBuffer.prototype)
SlidingBuffer.prototype.constructor = SlidingBuffer
SlidingBuffer.prototype.put = function(item) {
  if (this[$buffer].length === this[$size])
    this.take()
  this[$buffer].unshift(item)
}
exports.SlidingBuffer = SlidingBuffer

function DroppingBuffer(size) {
  UnblockingBuffer.call(this, size)
}
DroppingBuffer.prototype = Object.create(DroppingBuffer.prototype)
DroppingBuffer.prototype.constructor = DroppingBuffer
DroppingBuffer.prototype.put = function(item) {
  if (this[$buffer].length !== this[$size])
    this[$buffer].unshift(item)
}
exports.DroppingBuffer = DroppingBuffer



function ByteBuffer(byteLength) {
  this[$size] = byteLength
  this[$buffer] = []
  this.byteLength = 0
}
ByteBuffer.prototype = Object.create(FixedBuffer.prototype)
ByteBuffer.prototype.constructor = ByteBuffer
ByteBuffer.prototype.isFull = function() {
  return this[$size] <= this.byteLength
}
ByteBuffer.prototype.put = function(item) {
  if (!(item instanceof ArrayBuffer))
    throw TypeError("Can only put ArrayBuffer")
  FixedBuffer.prototype.put.call(this, item)
  this.byteLength = this.byteLength + item.byteLength
}
ByteBuffer.prototype.take = function() {
  var result = new ArrayBuffer(this.byteLength)
  var chunks = this[$buffer].splice(0)

  this.byteLength = 0

  var index = 0
  var offset = 0
  while (index < chunks.length) {
    var chunk = chunks[index]
    var element = 0
    while (element < chunk.byteLength) {
      result[offset] = chunk[element]
      element = element + 1
      offset = offset + 1
    }
    index = index + 1
  }

  return result
}
exports.ByteBuffer = ByteBuffer
