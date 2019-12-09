var PeerTreeServer = require('./../src/index')

var io = require('socket.io')()
var treeServer = new PeerTreeServer(io, {
  k1: 4,
  k: 2
})

// Allows clients to terminate their own connections
io.on('connection', function (socket) {
  socket.on('close', function () {
    socket.disconnect()
  })
})

var PORT = 3002
console.log('test server running on port ' + PORT)
io.listen(PORT)
