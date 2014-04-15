'use strict';

var buffer = require("./buffer")
var channel = require("./channel")

exports.Channel = channel.Channel
exports.OutputPort = channel.OutputPort
exports.InputPort = channel.InputPort
exports.Port = channel.Port
exports.Select = channel.Select
exports.FixedBuffer = buffer.FixedBuffer
exports.UnblockingBuffer = buffer.UnblockingBuffer
exports.SlidingBuffer = buffer.SlidingBuffer
exports.DroppingBuffer = buffer.DroppingBuffer
exports.ByteBuffer = buffer.ByteBuffer
// Wrap actual spawn in order to avoid loading gnode unless
// it's really necessary.
exports.spawn = function(routine) {
  return require("./spawn").spawn(routine)
}
