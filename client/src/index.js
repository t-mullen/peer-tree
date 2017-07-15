var Duplex = require('readable-stream').Duplex
var inherits = require('inherits')

var SimpleSignalClient = require('simple-signal-client')

inherits(PeerTreeClient, Duplex)

function PeerTreeClient (io, opts) {
  var self = this
  if (!(self instanceof PeerTreeClient)) return new PeerTreeClient(io, opts)

  Duplex.call(self, opts)

  self.opts = opts || {}

  self._treeID = null
  self.stream = null

  self._socket = io
  self._client = new SimpleSignalClient(io, {
    ignore: true
  })

  self._upPeerIDs = [] // IDs of confirmed upstream peers
  self._upPeers = []
  self._downPeers = []

  self._client.on('ready', self._onDiscover.bind(self))
  self._client.on('request', self._onRequest.bind(self))
  self._client.on('peer', self._onPeer.bind(self))
}

// Join an existing tree
PeerTreeClient.prototype.connect = function (treeID, stream) {
  var self = this

  if (self._treeID) {
    self.emit('error', new Error('Already connected to a tree'))
  }

  self._client.rediscover({
    treeID: treeID
  })
}

PeerTreeClient.prototype.disconnect = function () {
  var self = this

  self._treeID = null
  self.stream = null

  self._downPeers.forEach(function (peer) {
    peer.destroy()
  })
  self._upPeers.forEach(function (peer) {
    peer.destroy()
  })

  self._upPeerIDs = []
  self._downPeers = []
  self._upPeers = []

  self.emit('disconnect') // disconnected from tree
}

PeerTreeClient.prototype.reconnect = function (treeID, stream) {
  var self = this

  self.disconnect()
  self.connect(treeID, stream) // rejoin the tree
}

// Create a new tree
PeerTreeClient.prototype.create = function (stream) {
  var self = this

  if (self._treeID) {
    return self.emit('error', new Error('Already connected to tree.'))
  }

  self.stream = stream
  self._client.rediscover({
    createNew: true
  })
}

PeerTreeClient.prototype._onDiscover = function (discoveryData) {
  var self = this

  if (discoveryData.ignore) return
  if (discoveryData.err) {
    return self.emit('error', new Error(discoveryData.err))
  }

  discoveryData.peers.forEach(function (peerID) {
    self._upPeerIDs.push(peerID)
    self._client.connect(peerID, self.opts)
  })

  self.emit('discover', discoveryData.treeID) // discovered tree
}

PeerTreeClient.prototype._onRequest = function (request) {
  var self = this

  // All incoming requests are downstream, so no issue accepting them
  request.accept({
    stream: self.stream,
    wrtc: self.opts.wrtc
  })
}

PeerTreeClient.prototype._onPeer = function (peer) {
  var self = this

  if (self._upPeerIDs.indexOf(peer.id) === -1) {
    peer.index = self._downPeers.length
    self._downPeers.push(peer)
    // we ignore data from this peer, it is downstream
  } else {
    peer.isUpstream = true
    self._upPeers.push(peer)
    peer.on('data', self._onData.bind(self))
    peer.on('stream', self._onStream.bind(self))
    peer.on('connect', function () {
      self.emit('connect', self._treeID) // connected to tree
    })
  }
  peer.on('close', self._onClose.bind(self, peer))
}

PeerTreeClient.prototype._onData = function (data) {
  var self = this

  self.push(data)

  // forward downstream
  self._downPeers.forEach(function (peer) {
    peer.write(data)
  })
}

PeerTreeClient.prototype._onStream = function (stream) {
  var self = this

  if (self._downPeers.length > 0) {
    // TODO: Renegotiate instead of reconnecting
    self.reconnect(self._treeID, stream)
  } else {
    self.stream = stream
    self.emit('stream', stream)
  }
}

PeerTreeClient.prototype._onClose = function (peer) {
  var self = this

  if (peer.isUpstream) {
    self.reconnect()
  } else {
    self._downPeers.splice(peer.index, 1)
  }
}

PeerTreeClient.prototype._read = function () {}

PeerTreeClient.prototype._write = function (chunk, enc, next) {
  var self = this

  self._downPeers.forEach(function (peer) {
    peer.write(chunk)
  })
  next()
}

module.exports = PeerTreeClient
