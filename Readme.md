# Channel

[![Build Status](https://secure.travis-ci.org/Gozala/channel.svg)](http://travis-ci.org/Gozala/channel)


[![Browser support](https://ci.testling.com/Gozala/channel.png)](http://ci.testling.com/Gozala/channel)

This library is a reference implementation of [CSP][] style channels. If you are not familiar with channels and do not have time to read the paper at least take 30 minutes to watch [Rob Pike's talk](http://vimeo.com/49718712) that is a really good introduction.

A key characteristic of channels is that they are blocking (not in a thread blocking sense, but rather in logical sense, you need to asynchronously wait to continue). In the most primitive form, an unbuffered channel acts as a rendezvous, any consumer will await a producer and vice-versa. Buffering can be introduced, but unbounded buffering is discouraged, as bounded buffering with blocking can be an important tool coordinating pacing and back pressure, ensuring a system doesn't take on more work than it can achieve.

## Rationale

There comes a time in all good programs when components or subsystems must stop communicating directly with one another. This is often achieved via the introduction of queues between the producers of data and the consumers of that data. This architectural indirection ensures that important decisions can be made with some degree of independence, and leads to systems that are easier to understand, manage, monitor and change, and make better use of computational resources, etc.


## API

### Creating channels

You can create a channel with the `Channel` constructor. This will return a channel that has `output` port for writing data and `input` port for reading data, both support multiple writers and readers.

```js
var Channel = require("channel").Channel

var channel = new Channel()

channel.output.put(x)

var data = channel.input.take()
```


By default, the channel is unbuffered, but you can supply a number to indicate a buffer size, or supply a buffer object created via `FixedBuffer`, `DroppingBuffer`, `SlidingBuffer` or even your own custom buffer:

```js
var FixedBuffer = require("channel").FixedBuffer
var DroppingBuffer = require("channel").DroppingBuffer
var SlidingBuffer = require("channel").SlidingBuffer

var channel = new Channel(17)

var droppingBuffer = new DroppingBuffer(20)
var droppingChannel = new Channel(droppingBuffer)

var slidingBuffer = new SlidingBuffer(30)
var slidingChannel = new Channel(slidingBuffer)
```

The fundamental operations on channels are putting and taking values. Both of those operations potentially block, but how that blocking is handled is left up to user. Generator-based flow control libraries like [task.js][], [co][], [suspend][] and others make *cooperative* task coordination very intuitive (Example below uses such a `spawn` function that is included with a library):


```js
function pipe(input, output, close) {
  spawn(function*() {
    var chunk = void(0)
    // yield blocks the task until operation is complete, resuming
    // it from the point it left of. If chunk is `void` input is closed
    // and all chunks are already taken.
    while (chunk = yield input.take(), chunk !== void(0)) {
      yield output.put(chunk)
    }
    // If optional `close` argument is `true` close output
    // port on completion.
    if (close) output.close()
  })
}
```

While generators make use of channels a lot more expressive, they are not a requirement. It's is quite possible to express same old school way:


```js
function pipe(input, output, close) {
  function read() {
    input.take().then(write)
  }

  function write(data) {
    if (data === void(0)) {
      if (close) output.close()
    } else {
      output.put(data).then(read)
    }
  }

  read()
}
```

As you make have notice `take` and `put` return promises, which is partially true. In fact they return objects that derive from promises and represent take / put operations. Those operations can be pending or complete. In some cases it may be useful to handle complete operations immediately which may improve data throughput but requires playing state machine game. Here is same `pipe` exmaple that does not waits on promise unless it needs to (**note that first exmaple is identical but is lot more expressive**):

```js
function pipe(input, output, close) {
  var operation = void(0)
  var state = void(0)

  // switch to take
  function take() {
    state = take
    operation = input.take()
  }

  // switch to put
  function put(value) {
    state = put
    operation = input.put(value)
  }

  function pump() {
    while (!operation.isPending()) {
      var value = operation.valueOf()
      // If we reached the end & close is true
      // close output & return.
      if (value === void(0))
        return close && output.close()
      // If we took value put it to output.
      else if (state === take)
        put(value)
      // If we put value now take on from input.
      else if (state === put)
        take()
    }
    // If loop was escaped then operation is pending
    // so resume the loop after it's complete.
    operation.then(pump)
  }

  take()
  pump()
}
```

### Selects

It is often desirable to be able to wait for any one (and only one) of a set of channel operations to complete. This powerful facility is made available through the `Select` API. If more than one operation is available to complete, one can be chosen by an order they are supplied.

```js
var Select = require("channel").Select
function read(socket) {
  var select = new Select()
  var data = select.take(socket.data)
  // If error transform error reason to a rejected promise.
  var error = select.take(socket.error).then(Promise.reject)
  // Given that select guarantees that only one of the operations
  // is going to complete we can use `Promise.race` to return
  // the one that will actually complete.
  return Promise.race([data, error])
}
```

Above example uses select API to choose between two take operations. Select API guarantees that only one of the suplied operations will be complete depending on which one is available first. If both takes are available then first take will complete is it was supplied first.

Select API can also handle different types of operations with in the same operation.

```js
function save(data, timeout) {
  var select = new Select()
  return Promise.race([
    select.take(timeout).then(function(x) {
      console.log("Task has timed out")
      return Promise.reject(x)
    }),
    select.put(server1, data).then(function() {
      console.log("Wrote ", data, "to server#1")
    })
    select.put(server2, data).then(function() {
      console.log("Wrote ", data, "to server#2")
    })
  ])
}
```

[CSP]:http://en.wikipedia.org/wiki/Communicating_sequential_processes
[task.js]:http://taskjs.org/
[co]:https://github.com/visionmedia/co
[suspend]:https://github.com/jmar777/suspend
