var test = require('tape')
var PeerTreeClient = require('./../src/index')
var io = require('socket.io-client')

var TEST_SERVER_URL = 'http://localhost:3002'

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

test('connect clients and send data (n=30, k1=4, k=2)', function (t) {
  var n = 30

  t.plan((n - 1) * 4)
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

  clients[0].on('downstreamPeer', (peer) => {
    peer.write(testData)
  })

  clients[0].on('discover', treeID => {
    clients.forEach((client, i) => {
      if (i === 0) return
      client.connect(treeID)
      client.on('discover', (treeID) => {
        t.pass('client discovered', treeID)
      })
      client.on('upstreamPeer', (peer) => {
        peer.on('connect', () => {
          t.pass('client connected to upstream peer', peer.id)
        })
        peer.on('data', function (data) {
          t.equals(testData, data.toString(), 'got data')
          setTimeout(function () {
            sockets[i].emit('close')
            t.pass('socket closed')
          }, 3000)
        })
      })
      client.on('downstreamPeer', (peer) => {
        peer.write(testData)
      })
    })
  })
})

test('tree can recover', function (t) {
  t.plan(2)
  const root = PeerTreeClient(io(TEST_SERVER_URL), { wrtc })
  const mid = (new Array(4)).fill(null).map(_ => PeerTreeClient(io(TEST_SERVER_URL), { wrtc }))
  const leaf = PeerTreeClient(io(TEST_SERVER_URL), { wrtc })

  root.create()
  root.on('discover', (treeID) => {
    let waiting = 4
    mid.forEach(c => {
      c.connect(treeID)
      c.on('upstreamPeer', () => {
        waiting--
        if (waiting === 0) {
          leaf.connect(treeID)
          let first = true
          leaf.on('upstreamPeer', () => {
            t.pass('leaf got upstream')
            if (first) mid.forEach(c => c.destroy())
            first = false
          })
        }
      })
    })
  })
})

test('SUMMARY', function (t) {
  t.end()
  if (process && process.exit) {
    process.exit(0)
  }
})
