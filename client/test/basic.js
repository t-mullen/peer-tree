var test = require('tape')
var PeerTreeClient = require('./../src/index')
var io = require('socket.io-client')

var TEST_SERVER_URL = 'http://localhost:3001'

// For testing on node, we must provide a WebRTC implementation
var wrtc
if (process.env.WRTC === 'wrtc') {
  wrtc = require('wrtc')
} else if (process.env.WRTC === 'electron-webrtc') {
  wrtc = require('electron-webrtc')()

  wrtc.on('error', function (err, source) {
    if (err.message !== 'Daemon already closed') {
      console.error(err, source)
    }
  })
}

test('construct client', function (t) {
  t.plan(2)

  t.timeoutAfter(10000)

  var socket = io(TEST_SERVER_URL)

  t.doesNotThrow(function () {
    var client = new PeerTreeClient(socket, { wrtc: wrtc })
    t.equals(true, !!client)
    socket.emit('close')
  })
})

test('connect clients and send data (n=15, k=2)', function (t) {
  var n = 15
  
  t.plan(2+((n-1)*4))
  t.timeoutAfter(15000)

  var sockets = []
  var clients = []

  var testData = 'hello world'

  for (var i = 0; i < n; i++) {
    sockets.push(io(TEST_SERVER_URL))
    clients.push(PeerTreeClient(sockets[i], {
      wrtc: wrtc
    }))
  }

  clients[0].create()

  clients[0].on('discover', function (treeID) {
    t.pass('broadcaster discovered')

    for (var i = 1; i < clients.length; i++) {
      clients[i].connect(treeID)
      clients[i].on('discover', function (treeID) {
        t.pass('client discovered')
      })

      var waiting = n-1
      clients[i].on('connect', function (treeID) {
        t.pass('client connected to upstream peer')
        waiting--
        if (waiting === 0) {
          console.log(0, clients[0]._upPeers, clients[0]._downPeers)
          clients[0].write(testData)
          t.pass('broadcaster sent data')
        }
      })

      ;(function (i) {
        clients[i].on('data', function (data) {
          console.log(i, clients[i]._upPeers, clients[i]._downPeers)
          t.equals(testData, data.toString())
          setTimeout(function () {
            sockets[i].emit('close')
            t.pass('socket closed')
          }, 3000)
        })
      }(i))
    }
  })
})

test('SUMMARY', function (t) {
  t.end()
  if (process && process.exit) {
    process.exit(0)
  }
})
